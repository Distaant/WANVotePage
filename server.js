/**
 * CLASSROOM GRADING APP - LOCALHOST.RUN VERSION (FIXED)
 * * INSTRUCTIONS:
 * 1. Create a folder named 'public' in this directory.
 * 2. Save the frontend code as 'index.html' inside the 'public' folder.
 * 3. Run 'start.bat' to launch.
 */

const express = require('express');
const http = require('http');
const https = require('https'); // Added for URL Shortener API
const socketIo = require('socket.io');
const path = require('path');
const { spawn } = require('child_process');

// --- Server Setup ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- In-Memory Database ---
let gameState = {
  sessionId: null,
  name: "Classroom Session",
  categories: [],
  currentSubject: "",
  currentParticipants: [], 
  votingMode: "group", 
  isVotingOpen: false,
  votes: [], 
  availableIps: [{ name: 'Initializing Tunnel...', url: '#' }], 
  selectedIpIndex: 0, 
  connectedClients: 0, 
  lastSessionClientCount: 0 
};

// --- Connection Tracking (Map DeviceID -> Socket ID) ---
const activeConnections = new Map();

// --- URL Shortener Helper (is.gd) ---
function getShortUrl(longUrl) {
    return new Promise((resolve) => {
        // is.gd is a free, no-login, public API
        const apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`;
        
        https.get(apiUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                // On success, is.gd returns just the short URL as text
                if (res.statusCode === 200 && data.startsWith('http')) {
                    resolve(data.trim());
                } else {
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error('[WARN] Shortener API Error:', err.message);
            resolve(null);
        });
    });
}

// --- SSH Tunnel Logic (localhost.run) ---
function startTunnel() {
    console.log('[INFO] Starting localhost.run tunnel...');
    
    // FIX: Use 127.0.0.1 explicitly to avoid IPv6 mismatches.
    // -T: Disable pseudo-terminal allocation (cleaner for background processes)
    // -o StrictHostKeyChecking=no: Don't ask for verification
    const ssh = spawn('ssh', [
        '-T', 
        '-R', '80:127.0.0.1:' + PORT, 
        '-o', 'StrictHostKeyChecking=no', 
        'nokey@localhost.run'
    ]);

    const handleOutput = (data) => {
        const output = data.toString();
        // Regex to find the URL (supports lhr.life and localhost.run domains)
        const match = output.match(/(https?:\/\/[a-zA-Z0-9-]+\.(lhr\.life|localhost\.run))/);
        
        if (match) {
            const publicUrl = match[0];
            
            // FIX: Ignore the admin interface URL
            if (publicUrl.includes("admin.localhost.run")) return;

            console.log(`[SUCCESS] Tunnel active: ${publicUrl}`);
            console.log('[INFO] Generating short link...');

            // Automatically shorten the URL
            getShortUrl(publicUrl).then((shortUrl) => {
                const ips = [];
                
                if (shortUrl) {
                    console.log(`[SUCCESS] Short Link: ${shortUrl}`);
                    ips.push({ name: 'Short Link (Recommended)', url: shortUrl });
                    ips.push({ name: 'Original Public Link', url: publicUrl });
                } else {
                    ips.push({ name: 'Public Link (Students)', url: publicUrl });
                }
                
                ips.push({ name: 'Localhost (Teacher)', url: `http://localhost:${PORT}` });

                // Update state and notify clients
                gameState.availableIps = ips;
                io.emit('state-update', gameState);
            });
        }
    };

    ssh.stdout.on('data', handleOutput);
    ssh.stderr.on('data', handleOutput); // localhost.run outputs info to stderr

    ssh.on('close', (code) => {
        console.log(`[WARN] SSH tunnel closed with code ${code}. Restarting in 5 seconds...`);
        setTimeout(startTunnel, 5000);
    });

    ssh.on('error', (err) => {
        console.error('[ERROR] SSH Spawn Error:', err);
    });
}

// --- Routes ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// CSV Export Route
app.get('/export', (req, res) => {
  const categories = gameState.categories;
  const votes = gameState.votes;

  // Group by Main Subject first
  const votesByMainSubject = votes.reduce((acc, vote) => {
    if (!acc[vote.mainSubject]) acc[vote.mainSubject] = [];
    acc[vote.mainSubject].push(vote);
    return acc;
  }, {});

  // Prepare CSV Rows
  const csvRows = [];
  
  // Header Row
  const headers = ['Group/Subject', 'Participant/Detail', 'Vote Count', ...categories.map(c => c.name)];
  csvRows.push(headers.join(','));

  Object.entries(votesByMainSubject).forEach(([mainSubject, mainVotes]) => {
      // 1. Calculate Overall Group Average (All votes for this main subject)
      const groupCount = mainVotes.length;
      const groupCatTotals = {};
      
      mainVotes.forEach(vote => {
          categories.forEach(cat => {
              const score = parseFloat(vote.scores[cat.id] || 0);
              groupCatTotals[cat.id] = (groupCatTotals[cat.id] || 0) + score;
          });
      });

      const groupCatAvgs = categories.map(cat => (groupCatTotals[cat.id] / groupCount).toFixed(2));

      // Add Main Group Row
      csvRows.push([`"${mainSubject}"`, '"Group Score"', groupCount, ...groupCatAvgs].join(','));

      // 2. Break down by Sub-Subject (Participants)
      const subVotesMap = mainVotes.reduce((acc, vote) => {
          if (!acc[vote.subject]) acc[vote.subject] = [];
          acc[vote.subject].push(vote);
          return acc;
      }, {});

      Object.entries(subVotesMap).forEach(([subSubject, subVotes]) => {
          let displayName = subSubject;
          if (subSubject.startsWith(mainSubject + " - ")) {
              displayName = subSubject.replace(mainSubject + " - ", "");
          } else if (subSubject === mainSubject || subSubject === `${mainSubject} (Group)`) {
             displayName = "Group Evaluation";
          }

          const count = subVotes.length;
          const catTotals = {};

          subVotes.forEach(vote => {
              categories.forEach(cat => {
                  const score = parseFloat(vote.scores[cat.id] || 0);
                  catTotals[cat.id] = (catTotals[cat.id] || 0) + score;
              });
          });

          const catAvgs = categories.map(cat => (catTotals[cat.id] / count).toFixed(2));

          // Add Sub Row
          csvRows.push([`""`, `"${displayName}"`, count, ...catAvgs].join(','));
      });
      
      // Add Spacer Row
      csvRows.push(',,,,');
  });

  res.header('Content-Type', 'text/csv');
  res.attachment('grading_results_' + new Date().toISOString().slice(0,10) + '.csv');
  res.send(csvRows.join('\n'));
});

// --- Socket Logic (Real-time Communication) ---
io.on('connection', (socket) => {
  let clientIp = socket.handshake.address;
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.substr(7);
  }

  // NOTE: We do NOT set clientId immediately. 
  // We wait for the 'client-identify' event from the frontend (FingerprintJS + LocalStorage).
  
  socket.on('client-identify', (deviceId) => {
      const clientId = deviceId || 'unknown-' + socket.id;
      socket.deviceId = clientId; // Store for this socket session

      console.log('Client Identified: ' + clientId + ' (IP: ' + clientIp + ')');

      // Limit One Connection Per Device
      if (activeConnections.has(clientId)) {
        const oldSocketId = activeConnections.get(clientId);
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket && oldSocket.id !== socket.id) {
          oldSocket.emit('force-disconnect', 'New connection from this device detected.');
          oldSocket.disconnect(true);
        }
      }

      activeConnections.set(clientId, socket.id);
      
      // Update connected clients count
      gameState.connectedClients = activeConnections.size;
      
      // Send initial state to this user
      socket.emit('state-update', gameState);
      // Broadcast client count update to host
      io.emit('state-update', gameState);
  });

  socket.on('disconnect', () => {
    // Only remove if this specific socket was the active one for that device
    if (socket.deviceId && activeConnections.get(socket.deviceId) === socket.id) {
      activeConnections.delete(socket.deviceId);
      
      gameState.connectedClients = activeConnections.size;
      io.emit('state-update', gameState);
    }
  });

  socket.on('host-create-session', (data) => {
    gameState.name = data.name;
    gameState.categories = data.categories;
    gameState.sessionId = Math.random().toString(36).substring(7);
    gameState.votes = []; 
    io.emit('state-update', gameState);
  });

  socket.on('host-select-ip', (index) => {
      if (index >= 0 && index < gameState.availableIps.length) {
          gameState.selectedIpIndex = index;
          io.emit('state-update', gameState);
      }
  });

  socket.on('host-update-status', (data) => {
    if (gameState.isVotingOpen && data.isVotingOpen === false) {
        gameState.lastSessionClientCount = gameState.connectedClients;
    }

    if (data.currentSubject !== undefined) gameState.currentSubject = data.currentSubject;
    if (data.isVotingOpen !== undefined) gameState.isVotingOpen = data.isVotingOpen;
    if (data.currentParticipants !== undefined) gameState.currentParticipants = data.currentParticipants;
    if (data.votingMode !== undefined) gameState.votingMode = data.votingMode;

    io.emit('state-update', gameState);
  });

  socket.on('student-submit-vote', (data) => {
    if (!gameState.isVotingOpen) return;
    
    // Identify via the deviceId stored on socket
    const clientId = socket.deviceId;
    if (!clientId) {
        socket.emit('error-message', 'Identification error. Please refresh.');
        return;
    }

    // Prevent Double Voting (Check DeviceID against the MAIN Subject)
    const alreadyVoted = gameState.votes.some(v => 
        v.mainSubject === gameState.currentSubject && v.clientId === clientId
    );

    if (alreadyVoted) {
        socket.emit('error-message', 'You have already voted for this subject!');
        return;
    }

    const items = data.items || [];

    items.forEach(item => {
        let displaySubject = gameState.currentSubject;

        if (item.type === 'group') {
             if (gameState.votingMode === 'mixed') {
                 displaySubject = `${gameState.currentSubject} (Group)`;
             } else {
                 displaySubject = gameState.currentSubject;
             }
        } else if (item.type === 'participant') {
             displaySubject = `${gameState.currentSubject} - ${item.name}`;
        }

        gameState.votes.push({
            mainSubject: gameState.currentSubject, 
            subject: displaySubject,              
            scores: item.scores,
            voterId: socket.id,
            voterIp: clientIp,
            clientId: clientId // Use the Fingerprint/LocalStorage ID
        });
    });

    io.emit('state-update', gameState);
  });
});

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n==================================================');
  console.log('CLASSROOM SERVER RUNNING!');
  console.log('TEACHER: Access http://localhost:' + PORT);
  console.log('Tunneling to public URL (Wait a few seconds)...');
  startTunnel();
  console.log('==================================================\n');
});