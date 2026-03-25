
- update admin address and upgrade address in all contracts
- deploy contracts (deploy dutch auction first so utilities contracts get deployed along),
- deploy others - ascending, sealed, raise (in any order) - the utilities are network referenced, not local in program.json
- update programs.json in deployments/program.json with program addresses and program Id
- setup envs in services/api, services/indexer, apps/frontend, use .env.example as guide
- run indexer, run api, and start the frontend
- on the frontend, connect your admin-address, click on the top-righ user drop and navigate to '/admin' route
- set approved caller contract in each utility contract - each auction contract must be approved in each utilities.
- The app is ready to be used -> create-auction, bid and so on