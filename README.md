# Route Genius

Create a standalone Lovable app from the uploaded Supply-Chainer ZIP (attached). Import the existing project as-is: keep the existing React frontend, dark-console design, all screens, features and architecture (origin/destination search, transport/policy controls, scenario selection, recommendation cards, Decision Integrity Audit sidebar, tradeoff metrics). Do not rebuild it from scratch.

Then apply all the fixes previously identified in this chat (a unified diff with the exact fixes is attached as supply-chainer.patch):
1. Correct the threat-intelligence / CARF risk logic: disaster-over-safe semantic margin above the noise floor produces a threat score; at/below the floor is safe. CARF is modal keyword screening per transport mode (air/sea/rail/road) so mode-mismatched threats are rejected as false alarms (e.g. "air traffic control" must not raise road risk), with explain_filter() audit output (carf_filtered_score, false_alarm_rejected, reason).
2. Connect the existing ML p85 delay prediction to route scoring: per-leg worst-case predicted delay included in FASTEST/SAFEST/BALANCED weights and in the route response (predicted_ml_delay).
3. Disruption scenarios must visibly change the recommended route: e.g. SUEZ_BLOCK on Shanghai→Rotterdam must reroute via Singapore/Colombo/Durban/Algeciras with the changed ETA, risk and predicted delay shown; safer personas avoid disrupted nodes when an alternative exists.
4. Clear route visualization: clickable route cards with active highlight, and a horizontal multimodal route corridor showing legs, hubs, modes, ETA and per-leg predicted delay.
5. An "AI Route Decision" panel showing why the route was chosen: strategy, reroute/deflection badge, risk, ETA, cost, predicted p85 delay, CARF false-alarm count, and rationale.

Platform constraint: Lovable apps cannot run the Python FastAPI/PyTorch backend. Keep the frontend as-is and reimplement the engine logic (threat intelligence, CARF filter, route recommender, scenario manager, delay model) as Lovable Cloud server functions with the same API contract the frontend already calls, so behavior matches the patched Python version, including the test cases from supply-chainer.patch (port strike rejected for rail, sea threat retained for sea, flooding retained for road, air-traffic-only outage rejected for road, and the Suez-bypass route change).

After applying the fixes, run/build the project and fix any errors, then verify the complete flow end to end: normal recommendation, scenario-driven reroute, route selection, corridor visualization and AI Route Decision panel, and send a screenshot of the final result.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://clever-logistics-path.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c8d525c1-1d0a-4cfc-967c-1ab32d19471e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
