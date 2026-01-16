# WANVotePage

Run start.bat or start.sh teacher, will join as localhost and students will join with shortened url showed in the console or in the teachers interface.
NodeJS must have firewall access.

Features
- Uses FingerprintJS to give a unique id to a browser so only one browser per vote (obviously you can open another browser but theres not really a way I can think of to fix that without compromising on ease of use) 
- CSV Export.
- Live voting updates.
- Multiple voting modes:
  > Group Only -> You only vote for the group grade.
  
  > Group + Participants -> You vote for the group grade and each participants grade.
  
  > Participans Only -> You only vote for each participants grade, group grade is the average of all grades.
- Network selection (In case you have multiple networks, for example VMs).
- Ability to choose criteria and max/min grades.
- Cool UI
