# Monsoon Relay

**Track** — Voice · Listen & Act  
**Live demo** — https://monsoon-relay.vercel.app/  
**Public repository** — https://github.com/Arham-Begani/Monsoon-relay  
**Screen-recorded walkthrough** — https://monsoon-relay.vercel.app/watch.html

## Project description

A flood-relief volunteer reports that a road has closed. Monsoon Relay identifies the relevant street section, shows the proposed change to the operator for confirmation, and negotiates a revised drinking-water delivery. A shelter and two independently executing depot agents check availability, stock, van capacity and deadlines on a real Bengaluru street graph. The shelter can account for every committed crate and explain any shortfall. Judges can submit a voice report, change a stock reservation, introduce multiple closures or run every possible next closure as an experiment.

## What to demonstrate

Close the featured section of Bhaskaran Road. West’s 12-minute drive becomes a 21-minute trip and misses the 15-minute deadline. East has 20 crates, eight committed to a school shelter and a van with capacity for 16. Its agent offers 12 crates on an eight-minute route, the community hall accepts, and East commits. West alone could pledge zero crates on time. These are simulation results. Change the school reservation to 18 and the coordinated offer falls to two.

## Sponsor use and evidence

| Platform | Project use and verification |
|---|---|
| BAND | Three independently authenticated agents completed a real BAND room negotiation using the TypeScript SDK and its HTTPS transport. The eight-message exchange took 8.46 seconds and confirmed 12 crates on time with eight outstanding. The browser demo runs its own local workers. [Verified BAND messages](docs/band-live-run.md) |
| AdaL | The repository includes the source screen recording, tested CLI invocation and Video Producer editing prompt. The source capture was produced from the running application. An authenticated AdaL render is pending. |
| Finch, Lyzr, Agent37 | No integration claimed. |

## Engineering challenges

- A reported road name can refer to several map sections. The field agent requests an exact section or an explicit reference to the selected road. Ambiguity, negation and uncertain reports leave the plan intact.
- A fast-moving operator can change stock while the workers are still negotiating. Each simulation has a unique run ID, and the UI accepts only the latest revision. A depot commitment is idempotent within a run.
- A visually plausible detour can still arrive too late. Every offer is checked against the same directed road graph and deadline. Judges can compare coordinated dispatch with West operating alone and audit the individual messages.
- Microphone services vary by browser. An English sample and short audio uploads use an on-device acoustic model. Typed Hindi, Hinglish and English reports also pass through the same confirmation step.

## Before sending the entry

Complete the owner-authenticated AdaL render and replace the corresponding evidence line with its verified output. The organizer requires a public repository and a demo. The main rules specify an AdaL video no longer than two minutes. Submission closes on 24 November 2026 at 10 PM IST. [Organizer brief](https://app.hidevs.xyz/hackathons/diwali-festiverse-a2a-india-2026) · [Evaluation and submission fields](https://app.hidevs.xyz/hackathons/diwali-festiverse-a2a-india-2026?tab=evaluation)
