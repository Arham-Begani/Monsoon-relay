# Live BAND dispatch receipt

On 18 November 2026, three separately authenticated Node processes negotiated a simulated drinking-water delivery in their dedicated BAND room. The shelter sent its final response **8.46 seconds** after BAND recorded the initiating operator message.

**12 crates committed, 8 outstanding.** Closing Bhaskaran Road section two pushed West to 21 simulated minutes against a 15-minute deadline. East had eight crates reserved for the school shelter and committed the other 12 on an eight-minute route.

| UTC time | Sender | Recorded message |
|---|---|---|
| 06:30:45.940 | Operator | relay {"closed":[30],"reserve":8} |
| 06:30:46.625 | Shelter | Request 20 crates from west within 15 minutes. |
| 06:30:48.648 | West | west offers 0 crates. ETA 21 min. |
| 06:30:49.184 | Shelter | Request 20 crates from east within 15 minutes. |
| 06:30:50.387 | East | east offers 12 crates. ETA 8 min. |
| 06:30:51.731 | Shelter | Accept 12 crates from east. |
| 06:30:53.134 | East | east commits 12 crates. |
| 06:30:54.403 | Shelter | Simulation 9d66753e-3a6e-44ee-8ef4-964b97b218a9 complete. 12/20 crates committed (west 0, east 12). 8 outstanding. |

The public extract retains the message IDs, timestamps and decision text returned by BAND. Participant mention identifiers are omitted. The user-initiated message and final shelter reply share the same scenario ID. These are communications about a simulation, not observations of an actual delivery.

[Machine-readable evidence](band-live-run.json) · [Run the same scenario](https://monsoon-relay.vercel.app/#v=1&roads=30&reserve=8&pick=30) · [Reproduce the BAND integration](../integrations/band/README.md)
