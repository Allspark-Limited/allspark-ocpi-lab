-- Password hashes are now stored in modular crypt format:
--   scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>
-- (salted scrypt, 16-byte salt, 64-byte derived key). The previous fixed
-- 64-char check allowed unsalted SHA-256; widen it to accept the MCF string.
alter table lab_private.users
  drop constraint if exists users_password_hash_check;

-- Legacy unsalted SHA-256 hashes cannot be upgraded without the plaintext,
-- so mark them disabled; affected users simply re-register.
update lab_private.users
  set password_hash = 'scrypt$disabled$0$0$0$disabled'
  where password_hash not like 'scrypt$%';

alter table lab_private.users
  add constraint users_password_hash_check
  check (password_hash like 'scrypt$%');
