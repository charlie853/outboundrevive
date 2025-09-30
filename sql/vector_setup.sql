-- Optional vector extension and index (run once in your DB)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX IF NOT EXISTS kb_embeddings_idx ON public.kb_embeddings USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Optional server-side function used by lib/vector.semanticSearch
-- adjust dimension if you use a different embedding model size
CREATE OR REPLACE FUNCTION public.kb_semantic_search(p_account uuid, p_embedding vector(1536), p_k int)
RETURNS TABLE (chunk_id uuid, title text, content text, distance float)
LANGUAGE sql STABLE AS $$
  SELECT c.id as chunk_id, c.title, c.content, (e.embedding <=> p_embedding) as distance
  FROM kb_embeddings e
  JOIN kb_chunks c ON c.id = e.chunk_id
  WHERE e.account_id = p_account
  ORDER BY e.embedding <=> p_embedding
  LIMIT p_k;
$$;

