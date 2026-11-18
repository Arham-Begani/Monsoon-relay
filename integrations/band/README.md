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

## Provision agents and a room with the Human API

The owner can sign in at [Band](https://app.band.ai/), open the account menu → **Settings** → **REST API Keys** → **Create New API Key**, and select **Full access** for a temporary provisioning key. The register-only scope covers agent creation but cannot create a room. Store the key in the runtime's secret manager as BAND_USER_KEY or in a private file at ~/.config/monsoon-relay-band/owner.key with mode 0600. [Authentication and API keys](https://docs.band.ai/security/authentication) · [Human API](https://docs.band.ai/api/human-api)

With the owner credential available, run the following from integrations/band:

```sh
node provision.mjs
```

The helper registers three owner-controlled external agents, saves each one-time credential before the next registration, then creates a dedicated room with all three participants. It prints the room ID and private environment-file path. The default state directory is ~/.config/monsoon-relay-band, outside the site checkout. Use one provisioning process per directory. Subsequent runs reuse that directory's recorded resources. After an ambiguous network failure the helper records which creation needs checking before a retry. If the account reaches its plan quota, the helper reports the API error and preserves completed registrations.

To start each peer from integrations/band with the generated private environment, run the following in three terminals, substituting west and east for shelter in the other two:

```sh
node --env-file="$HOME/.config/monsoon-relay-band/peers.env" peer.mjs shelter
```

Open **Monsoon Relay · Dispatch Test** in Band and send the example scenario above. Owner access can be revoked in Settings once provisioning and any owner-driven tests are complete. The peers use their own agent keys.

### One-command owner setup and verification

From the repository root on Linux or macOS with Python 3 and Node 22.12 or later:

```sh
./integrations/band/run.py --test-room
```

The runner installs the locked SDK when needed, reads the temporary owner key from a hidden terminal prompt, BAND_USER_KEY, or the private owner.key file, provisions the peers and dedicated room, then starts all three peers. With --test-room it waits for all three agents to appear online, sends one road-30 scenario, and checks the room for a shelter reply matching the originating message ID and exact 12/20 outcome. A plan restriction on Human API sends can return HTTP 403. In that case run the same command without --test-room and submit the example using the shelter mention picker in the room. [Send messages](https://docs.band.ai/api/human-api/human-api-messages/send-my-chat-message) · [Read messages](https://docs.band.ai/api/human-api/human-api-messages/list-my-chat-messages)

Keep the runner open to serve the room. Ctrl+C stops its local peers. Add --exit-after-test for a single verification run that stops those processes on completion. Room and agent registrations stay in your Band account. Run the orchestration fixtures from integrations/band with `python3 -m unittest test_runner`.

### Dedicated-room REST transport

Band recommends WebSocket delivery for ongoing work. Where an outbound proxy blocks WebSocket connections, the runner can use the Agent API backlog endpoint in the dedicated test room:

```sh
./integrations/band/run.py --transport rest --test-room
```

REST mode starts an independent process and authenticated client per peer. Each process verifies its identity and access to the room before signaling readiness. It reads its next actionable delivery, marks the delivery as processing, sends any reply with the recipient’s Band ID in the mentions array, and acknowledges the original delivery. Requests are sequential per agent with a 15-second request timeout, an idle wait of 1.8 seconds, and bounded backoff on failure. The room's online badges reflect WebSocket presence. The runner verifies the actual shelter reply using the Human API. Avoid starting a second transport for the same peer and room simultaneously. [Agent delivery semantics](https://docs.band.ai/api/agent-api) · [Next actionable message](https://docs.band.ai/api/agent-api/agent-api-messages/get-agent-next-message)

To serve an already provisioned room after rotating the owner key, run `./integrations/band/run.py --transport rest` from the project root. The private agent credentials are sufficient to receive and reply to commands. Posting the automated operator test with `--test-room` needs an owner key. On Node 24 behind a network proxy, set `NODE_USE_ENV_PROXY=1` and `NODE_OPTIONS=--use-system-ca` when the system trust store contains the proxy CA.
