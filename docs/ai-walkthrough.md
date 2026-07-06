# AI Walkthrough

## Goal

AI Walkthrough lets contractors, inspectors, landlords, adjusters, property managers, maintenance companies, and business owners walk, talk, record, upload, and document field work while Ferocity turns that unstructured input into business data.

The long-term product should reduce manual note taking, photo organization, report writing, inspection documentation, and estimate creation time.

## Current MVP

Route:

- `/app/ai-walkthrough`

Current behavior:

- User enters a walkthrough transcript or field notes.
- Ferocity extracts observations, quantities, units, materials, locations, customer requests, safety concerns, and open questions.
- Ferocity creates draft estimate line items.
- Ferocity creates inspection and insurance-support report drafts.
- User can review observation and estimate item statuses.
- Media references can be recorded for future upload/vision processing.

What is intentionally not claimed yet:

- No live video/audio transcription provider is wired.
- No photo or video storage pipeline is live.
- No visual damage detection model is live.
- No auto-publishing or automatic estimate sending occurs.
- No insurance report is sent without review.

## Database Tables

- `ai_walkthrough_sessions`
- `ai_walkthrough_media`
- `ai_walkthrough_observations`
- `ai_walkthrough_estimate_items`
- `ai_walkthrough_reports`

All tables are tenant-scoped and RLS-enabled.

## Provider Integration Points

Speech:

- Audio/video transcription provider can write transcript text into `ai_walkthrough_sessions.transcript_text`.

Vision:

- Photo/video analysis can create `ai_walkthrough_media` and `ai_walkthrough_observations`.

Video frame extraction:

- Extracted frames should be stored as `media_type = extracted_frame`, with timestamp and confidence.

Drone / Meta Glasses:

- Future capture modes already exist as `drone` and `meta_glasses`.

## Review Rules

Every generated finding should stay review-first.

- High confidence can be shown normally.
- Medium confidence should be editable.
- Low confidence should be clearly flagged before reports or estimates use it.

## Ferocity Handoff

Approved data should eventually flow into:

- Leads
- Customers
- Jobs
- Work orders
- Estimate line items
- Notes
- Tasks
- Reports
- Attachments
- Customer Proof
- Content Studio

## Phase 2

- Storage upload for photos, audio, and video.
- Transcription provider.
- Vision provider.
- Frame extraction worker.
- Estimate conversion button.
- Customer/job linking.
- Report PDF export.
- Insurance report template.
- Content mode for recap videos, Shorts, Reels, YouTube, and Facebook.
- Mobile-first capture UI.
