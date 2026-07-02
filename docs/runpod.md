# Scoring on a rented GPU (RunPod)

How to rent a GPU for scoring and point job-radar at it — no code changes needed, just
`.env`.

## Picking a GPU

Budget target: roughly $1/day, running the pod only long enough each day to drain the
scoring queue. RunPod bills per second, so you only pay for uptime.

| GPU | VRAM | ~$/hr | Fits | Verdict |
|---|---|---|---|---|
| RTX 3090 | 24 GB | ~$0.46 | mid-size model, Q4 | Same ceiling as a local rig — no point renting |
| 2× RTX 3090 | 48 GB | ~$0.92 | larger model via tensor-parallel | ❌ Skip: A100-class price, A6000-class speed, plus TP overhead |
| RTX A6000 | 48 GB | ~$0.49 | mid-large model, FP8/Q8, headroom for KV cache | ✅ Cheap way to validate the pipeline |
| **A100 80GB** | 80 GB | ~$1.19–1.64 (spot) | large model, AWQ | ✅ Main recommendation — real quality jump |
| H100 | 80 GB | ~$2.69 | same, ~1.5–2× faster | Worth it if the queue backs up |
| 2× A100 / H200 | 160/141 GB | ~$2.5–5.5 | top-tier model, 4-bit | Quality ceiling, for occasional comparison runs |

Rule of thumb: **one card beats two** at equal VRAM — no tensor-parallel overhead, and
MoE models are happiest on a single card. Two 3090s at ~$0.92/hr lose on every axis
against one A6000: twice the price for the same 48 GB and slower due to PCIe
synchronization.

Daily math: after filtering, ~50–150 vacancies/day; with `SCORING_CONCURRENCY=6` that
drains in 10–20 minutes → **$0.25–0.50/day on A100 spot**.

## First pod — A6000 via llama.cpp (step by step)

Serve with **llama.cpp** (the same server used locally): broad model support, GGUF
quantization, no "engine doesn't recognize this model" surprises. On an A6000-class card,
expect several hundred tokens/sec with `json_schema` working correctly.

1. runpod.io → Console → Pods → Deploy.
2. GPU: **RTX A6000** (48 GB). Cloud: **Community** (cheaper). Any available region.
3. Template → Custom, container image: **`ghcr.io/ggml-org/llama.cpp:server-cuda`**.
4. **Expose HTTP port 8000.**
5. **Container disk: ~35 GB** (a Q5-quantized ~30B model is roughly 25 GB). A network
   volume is optional for a first test; for regular use, mount ~40 GB at
   `/root/.cache/llama.cpp`.
6. **Container start command** (swap in your own secret for `MY_SECRET`):
   ```
   -hf <org>/<model>-GGUF:Q5_K_XL --host 0.0.0.0 --port 8000 -ngl 99 -c 16384 --parallel 4 --jinja --api-key MY_SECRET
   ```
   `-hf` pulls the GGUF straight from Hugging Face; `-ngl 99` puts every layer on GPU;
   `--parallel 4` allows concurrent scoring requests; `--jinja` picks the correct chat
   template for the model family.
7. Deploy. Watch the logs for the GGUF download (several minutes), then
   `server is listening on http://0.0.0.0:8000`.
8. Verify: `curl -H "Authorization: Bearer MY_SECRET" https://<POD_ID>-8000.proxy.runpod.net/v1/models`
   should return the model info as JSON.

## Pointing job-radar at it

In `backend/.env`:

```bash
LLM_BASE_URL=https://<POD_ID>-8000.proxy.runpod.net/v1
LLM_API_KEY=MY_SECRET
SCORING_CONCURRENCY=4   # match --parallel on the server
LLM_THINKING=false      # simpler for a first run; json_schema already forces clean JSON
```

Then sanity-check with one command (scores a strong and a weak example so you can see the
rubric working):

```bash
npm run llm:check -w backend
```

If the strong match scores high and the weak one scores low, the endpoint is wired up
correctly. Start the backend and the backlog reconciler will queue anything pending; at
`SCORING_CONCURRENCY=6` a few thousand queued vacancies drain in 15–25 minutes. The model
name is recorded on each score, so different models can be compared later.

Switch back to a local rig by resetting `LLM_BASE_URL=http://127.0.0.1:1234/v1`,
`SCORING_CONCURRENCY=1`, `LLM_THINKING=true`.

## Operating modes

- **Test/calibration** — start the pod manually, let the queue drain, stop it (the volume
  persists).
- **Daily burst** — the queue accumulates while the LLM is offline (BullMQ retries hold
  jobs); the pod comes up once a day for 30–60 minutes to clear it. Can be automated later
  via the RunPod API.
- Spot pods are 2–3× cheaper and interruption is harmless — BullMQ resumes scoring after
  a restart.

## Comparing models

Hand-label ~50 vacancies on the dashboard's **Labeling** tab, then:

```bash
npm run golden:eval -w backend     # scores the labeled set against the current LLM_BASE_URL
```

Run the eval against two different endpoints and compare false-alarm/miss rates — whether
a bigger model is worth the cost becomes a numbers question, not a feeling.
