# Monsoon Relay
An interactive flood-relief dispatch prototype for Halasuru, Bengaluru. Open index.html or run a local server in this folder with `python3 -m http.server 8000`. The map and dispatch simulation run entirely in the browser. Voice reporting uses the browser's speech service when available and requires microphone permission. Every closure is confirmed with the road button.

## Try the handoff
Close the preselected section of Bhaskaran Road. West depot's estimated delivery time moves from 12 to 21 minutes, beyond the community hall's 15-minute deadline. East depot can offer 12 crates in eight minutes. Adjust its other commitments or reopen the road to recompute the plan. All 294 mapped road sections are selectable. The first group in the selector lists the initial west van's route. Closures can be combined.

The first build uses deterministic local dispatch rules. Sponsor messaging, an AI voice agent and independently hosted depot agents are future integrations. Vehicles, water stocks, deadlines and the existing reservation for another recipient are simulated. Times are shortest-path estimates on the bounded street extract, using a fixed travel speed and loading time. The application shows dispatch pledges, not observed arrivals.

## Map data
Street geometry and building outlines © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Map bounds are 77.617–77.629° E and 12.974–12.982° N. The road graph includes in-bounds van-accessible street sections and models signed one-way direction. Local road numbers and numbered sections are simulator identifiers.

Run `node dispatch.test.cjs` to check single-road closures, reserve quantities and a disconnected network.
