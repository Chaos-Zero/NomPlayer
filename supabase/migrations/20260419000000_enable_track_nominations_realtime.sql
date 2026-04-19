-- Enable Supabase Realtime for track_nominations so clients can subscribe to
-- postgres_changes and refresh the community nominations panel live.
ALTER PUBLICATION supabase_realtime ADD TABLE track_nominations;
