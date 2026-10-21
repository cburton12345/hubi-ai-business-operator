-- Preserve the distinction between a deliberately paused device and a device
-- that has stopped reporting heartbeats. A later heartbeat restores offline
-- devices to active in the device API.

alter table public.ferocity_connect_devices
  drop constraint if exists ferocity_connect_devices_status_check;

alter table public.ferocity_connect_devices
  add constraint ferocity_connect_devices_status_check
  check (status in ('paired','active','offline','paused','needs_attention','revoked'));
