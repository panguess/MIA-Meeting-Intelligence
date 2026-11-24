# Architecture decisions

| ID | Decision | Status |
|---|---|---|
| ADR-001 | iPhone is the sole audio entry point | Accepted |
| ADR-002 | No Teams/Zoom/Meet bot or direct platform capture in V1 | Accepted |
| ADR-003 | Teams-on-laptop acoustic capture via iPhone microphone is the primary online-meeting workflow | Accepted |
| ADR-004 | External audio import must be initiated from iPhone | Accepted |
| ADR-005 | Audio retention target is 90 days; MIA reminds the user but never deletes audio automatically in the web app (changed 24 Nov 2026) | Accepted |
| ADR-006 | Local-first processing; Cloud AI disabled by default | Provisional architecture baseline |
| ADR-007 | Final Cloud vs Local decision requires a benchmark and provider/security review | Open |
| ADR-008 | Private repository required; do not place MIA source or specifications in a public repository | Accepted |
