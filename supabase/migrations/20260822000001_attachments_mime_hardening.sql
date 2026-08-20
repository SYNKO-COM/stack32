-- Harden chat attachments bucket: align size with client (8 MiB) and
-- restrict MIME types (was unrestricted / null).
-- Existing objects are unchanged; only new uploads are validated by Storage.

update storage.buckets
set
  file_size_limit = 8 * 1024 * 1024,
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/xml',
    'text/xml',
    'text/yaml',
    'application/x-yaml'
  ]
where id = 'attachments';
