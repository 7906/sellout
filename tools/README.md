# tools/

`start-for-friend.cmd` 一键开服脚本会用 `cloudflared.exe` 建公网隧道（发给朋友远程试玩）。

该二进制（约 54MB）不入库，请自行下载放到本目录：

- 下载地址：https://github.com/cloudflare/cloudflared/releases （`cloudflared-windows-amd64.exe`，改名为 `cloudflared.exe`）

不用公网联机的话可以完全忽略这个目录——本地 `npm run dev:server` + `npm run dev:client` 即可游玩。
