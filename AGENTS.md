<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Supply-Chainer engine is ported to TypeScript in src/lib/engine and served via /api/* server routes (dynamic-imported in handlers); why: Python/PyTorch backend can't run here and the original frontend's API contract must stay unchanged.
