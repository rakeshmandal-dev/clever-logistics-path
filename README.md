# Supplychainer (Route Genius)
Multimodal route recommender with disruption scenarios, CARF threat filtering and a p85 delay estimate.
Based on the organizer-provided Supply-Chainer repo (Apache 2.0). Live demo: https://clever-logistics-path.lovable.app

## What we changed
- Fixed: supplier disruption penalty (50% -> 10%), CARF keyword matching (whole-word), false "reroute/bypass" claims, misleading UI text.
- Added: ML delay in route weights, route corridor view, AI Route Decision panel, scenario audit.
- SUEZ_BLOCK on Shanghai -> Rotterdam (sea) reroutes via Singapore, Colombo, Durban, Algeciras.

## Limitations
The original Python/PyTorch backend cannot run on Lovable, so the engine is ported to TypeScript. NLP scoring is keyword-based and the delay model is a calibrated formula, not the trained model.

## AI usage disclosure
Built with AI assistance: Claude (code analysis, bug finding, fix design) and Lovable (implementation). We reviewed and tested the fixes ourselves.

## Run
npm i && npm run dev
