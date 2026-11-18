# Run Monsoon Relay in a Band room

Three independently authenticated Node processes negotiate one simulated shelter request in a shared Band room. The shelter asks the west depot first. Each depot evaluates its own route over the same Bengaluru street graph used by the browser. A positive offer requires an acceptance and the depot’s commitment before the shelter counts it. Every simulation starts with fresh inventory.

## Set up the peers

Use Node 22.12 or later. In the Band console, register three agents named Monsoon Shelter, West Depot and East Depot. Save each agent’s ID and API key on the machine that runs that peer. Create one room and add all three agents as participants. [Band quickstart](https://docs.band.ai/quickstart) · [Agent SDK](https://docs.band.ai/sdks/typescript/agent)

From the repository root, run:

```sh
cd integrations/band
npm ci
npm test
cp .env.example .env
```

Enter the three public agent IDs and their corresponding keys in the local .env file. If running on separate hosts, configure all three IDs and only that host’s own key. Keep this directory and .env outside any public static hosting directory. In three terminals in integrations/band, start one process per identity:

```sh
npm start -- shelter
npm start -- west
npm start -- east
```

Keep these processes running. The simulator uses deterministic policies and requires no model provider key.

## Run a scenario

In the room, use Band’s mention picker to select Monsoon Shelter. After the mention, paste the command copied from the demo or type:

```text
relay {"closed":[30],"reserve":8}
```

The closed array lists map road IDs, the zero-based indices in the bundled OSM street extract. Supply any combination or an empty array for open roads. Reserve is the number of East’s 20 crates already pledged elsewhere, from 0 to 20. West can carry 20 crates, East can carry 16, and the shelter needs 20 within 15 simulated minutes. The deadline uses route travel and loading times.

For the example, West reports 21 minutes and offers zero. East offers 12 crates at 8 minutes. The shelter accepts, East commits, and the shelter mentions the person who started the simulation with **12/20 crates committed, 8 outstanding**. The MR1 line on each peer message carries the structured decision and the originating Band message ID. All room participants can read the exchange.

Each run is scoped to the room and originating message. Reposting a command as a new message starts a fresh simulation. Each peer records its decisions in its local .state directory and reopens them after restart. Use a single process per identity and persistent local storage. During a send/restart race Band may display a duplicate message, while phase checks prevent double-counting a commitment.

## Verification

The tests exercise the installed SDK’s GenericAdapter and FakeAgentTools, routing messages between independently instantiated peers and reopening their journals on each turn. They cover open and cut-off networks, reserve and van limits, concurrent scenarios, duplicate deliveries, forged senders, invalid inputs and a retry after a transport failure. The credentialed room walkthrough requires a Band account and three agent credentials.
