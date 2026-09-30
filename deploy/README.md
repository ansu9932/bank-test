# Restore visitor IPs for admin access

The API trusts its loopback Nginx proxy. Copy `cloudflare-real-ip.conf` to
`/etc/nginx/snippets/bank-cloudflare-real-ip.conf` and include it inside the
API server block. Forward `X-Forwarded-For $remote_addr` after restoring the
visitor address. Only Cloudflare network sources may supply CF-Connecting-IP.
Run `sudo nginx -t` before reloading. Refresh the trusted ranges from
https://api.cloudflare.com/client/v4/ips when Cloudflare changes them.

Admin credentials and browser-device approval remain required. Additional
admin addresses may be set using the comma-separated ADMIN_ALLOWED_IPS variable.
