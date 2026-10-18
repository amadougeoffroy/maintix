-- Limiteur de débit partagé entre instances (fenêtres fixes).
create table rate_limits (
  key text not null,
  bucket bigint not null,
  n integer not null default 0,
  primary key (key, bucket)
);
