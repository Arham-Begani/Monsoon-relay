# Monsoon Relay

**Track** — Voice · Listen & Act  
**Live demo** — https://monsoon-relay.vercel.app/  
**Public repository** — https://github.com/Arham-Begani/Monsoon-relay  
**AdaL-rendered walkthrough (90.65 seconds)** — https://monsoon-relay.vercel.app/watch.html

## Project description

A community hall in Bengaluru needs 20 crates of drinking water in 15 minutes. The west depot can get there in 12. Then a volunteer radios in that a section of Bhaskaran Road has flooded. Which depot can still reach the hall, and how much water can it promise without taking supplies already pledged to a school?

Monsoon Relay is a voice-driven flood-relief dispatch simulator built around that decision. An operator hears the report, sees which street section it refers to, and confirms the closure. Three independent agents then negotiate a new plan. Each depot checks its route, available stock, van capacity and the shelter’s deadline. The shelter counts a crate only after it accepts an offer and the depot confirms its commitment.

In the featured scenario, the closure pushes West’s journey to 21 minutes. East can arrive in eight minutes. It has 20 crates, but eight are reserved for a school shelter. East commits the remaining 12. The hall can now ask another supplier for the eight crates it still needs. The map uses 970 real OpenStreetMap nodes in Halasuru. Stock and travel times are simulated. Judges can change the school’s reservation, inspect each agent’s messages, or test all 294 road sections to discover which closures actually force a handoff.

## What to demonstrate

Close the featured section of Bhaskaran Road. West’s 12-minute drive becomes a 21-minute trip and misses the 15-minute deadline. East has 20 crates, eight committed to a school shelter and a van with capacity for 16. Its agent offers 12 crates on an eight-minute route, the community hall accepts, and East commits. West alone could pledge zero crates on time. These are simulation results. Change the school reservation to 18 and the coordinated offer falls to two.

## How did you use BAND?

We gave the shelter, West depot and East depot separate BAND identities and ran each as its own Node.js process. Using the official BAND SDK over HTTPS, they exchanged requests, offers, an acceptance and a final commitment in a shared room. The recorded exchange took 8.46 seconds from the operator’s message to the shelter’s final tally of 12 crates pledged and eight outstanding. Judges can inspect all eight timestamped messages. The public simulator uses three browser workers so anyone can try the same negotiation without credentials. [BAND room receipt](docs/band-live-run.md)

## How did you use AdaL?

We used the authenticated AdaL CLI to produce the final 90.65-second walkthrough. Working with a local Ollama model, AdaL invoked FFmpeg through its Bash tool to combine the captioned screen recording, radio audio and narration with a closing card showing the verified BAND result. Judges can watch the road report change the plan, then check the actual agent exchange behind the closing numbers. [Watch the walkthrough](https://monsoon-relay.vercel.app/watch.html) · [AdaL render receipt](docs/adal/render-receipt.json)

## How did you use Finch?

Finch was not used in Monsoon Relay.

## How did you use Lyzr?

Lyzr was not used in Monsoon Relay.

## How did you use Agent37?

Agent37 was not used in Monsoon Relay.

## What problems did you face during building?

“Bhaskaran Road is flooded” sounds precise over the radio, but the map contains several sections with that name. Closing the wrong section can change which depot wins the request. We added section matching and operator confirmation. An ambiguous report leaves the current route in place. Browser microphone support also varied, so we added on-device English transcription for recorded and uploaded audio, alongside typed English, Hindi and Hinglish reports.

We also had to handle a depot replying after the operator had already changed a reservation. We gave every run a unique ID, ignored replies from earlier runs, and made repeated confirmations count only once. We then checked the routing and pledge logic across every single-road closure and compared 292 combinations of disruptions against independent agent negotiations.

## Submission details

The repository and demo are public. The linked AdaL export runs under the organizer’s two-minute limit. Submission closes on 24 November 2026 at 10 PM IST. [Organizer brief](https://app.hidevs.xyz/hackathons/diwali-festiverse-a2a-india-2026) · [Evaluation and submission fields](https://app.hidevs.xyz/hackathons/diwali-festiverse-a2a-india-2026?tab=evaluation)
