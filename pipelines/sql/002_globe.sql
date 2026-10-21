-- Representative visualization points, not observed departure/arrival coordinates.
CREATE TABLE visualization_anchors (
    geography_id text PRIMARY KEY REFERENCES geographies,
    latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    method text NOT NULL,
    source_url text NOT NULL CHECK (source_url LIKE 'https://%'),
    source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX migration_globe_filter ON migration_observations
    (batch_id, dataset_id, year_end, measure, value DESC, origin_id, destination_id)
    WHERE status = 'observed';
