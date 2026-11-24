-- MIA initial PostgreSQL schema draft.
-- Review identifiers, retention jobs, indexes, and access policies before production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    meeting_language TEXT[] NOT NULL DEFAULT ARRAY['th', 'en'],
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'recording', 'processing', 'review', 'approved', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audio_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL UNIQUE,
    checksum_sha256 TEXT NOT NULL,
    media_type TEXT NOT NULL,
    duration_seconds NUMERIC(12, 3),
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
    source TEXT NOT NULL CHECK (source IN ('iphone_recording', 'iphone_import')),
    captured_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transcript_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    sequence_no INTEGER NOT NULL,
    speaker_label TEXT,
    start_ms BIGINT NOT NULL CHECK (start_ms >= 0),
    end_ms BIGINT NOT NULL CHECK (end_ms >= start_ms),
    text TEXT NOT NULL,
    confidence NUMERIC(5, 4),
    UNIQUE (meeting_id, sequence_no)
);

CREATE TABLE meeting_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    output_type TEXT NOT NULL
        CHECK (output_type IN ('detailed_minutes', 'executive_summary', 'action_tracker', 'risk_issue_log')),
    content JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_user_created ON meetings(user_id, created_at DESC);
CREATE INDEX idx_audio_assets_expiry ON audio_assets(expires_at);
CREATE INDEX idx_transcript_meeting_sequence ON transcript_segments(meeting_id, sequence_no);
CREATE INDEX idx_outputs_meeting_type ON meeting_outputs(meeting_id, output_type);
