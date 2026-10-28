-- Cut-outs waiting to be fetched by the visual search service (deleted right after).
CREATE TABLE IF NOT EXISTS tmp_images (key TEXT PRIMARY KEY, type TEXT NOT NULL, bytes BLOB NOT NULL, created INTEGER NOT NULL);
