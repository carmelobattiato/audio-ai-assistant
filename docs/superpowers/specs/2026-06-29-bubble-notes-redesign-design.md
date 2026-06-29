# Bubble Notes Redesign — Design Spec

> Migrated from plan file. Approved 2026-06-29.

## Context

Il pannello "Notes" è usato principalmente per contestualizzare una riunione prima/durante: il 99% delle azioni è incollare screenshot o testo da email. L'editor attuale (contenteditable grezzo) ha icone di bassa qualità, paste imprevedibile e nessun undo robusto. Le note vengono mostrate come piccole bubble opache, poco leggibili. Lo screenshot workflow funziona ma è nascosto. Non esiste registrazione video.

**Obiettivo**: editor moderno paste-first, timeline leggibile, video screen recording a impatto zero su DB.

## Decisioni approvate

| Dimensione | Scelta |
|---|---|
| Editor | Tiptap v2 (ProseMirror) |
| Icone | Lucide React |
| Note display | Timeline verticale con preview |
| Video scope | Screen recording (riusa displayStream esistente) |
| Video save | Chunk progressivi scaricati su disco (Downloads) |

## Architettura

See implementation plan: `docs/superpowers/plans/2026-06-29-bubble-notes-redesign.md`
