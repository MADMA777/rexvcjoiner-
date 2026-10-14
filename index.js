const axios = require('axios');
const fs = require('fs');
const WebSocket = require('ws');
const config = require('./config.json');

// ────── ASCII ART ──────
const ascii = `

   ██████╗ ███████╗██╗  ██╗    ██╗   ██╗ ██████╗         ██╗ ██████╗ ██╗███╗   ██╗███████╗██████╗ 
   ██╔══██╗██╔════╝╚██╗██╔╝    ██║   ██║██╔════╝         ██║██╔═══██╗██║████╗  ██║██╔════╝██╔══██╗
   ██████╔╝█████╗   ╚███╔╝     ██║   ██║██║              ██║██║   ██║██║██╔██╗ ██║█████╗  ██████╔╝
   ██╔══██╗██╔══╝   ██╔██╗     ╚██╗ ██╔╝██║         ██   ██║██║   ██║██║██║╚██╗██║██╔══╝  ██╔══██╗
   ██║  ██║███████╗██╔╝ ██╗     ╚████╔╝ ╚██████╗    ╚█████╔╝╚██████╔╝██║██║ ╚████║███████╗██║  ██║
   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝      ╚═══╝   ╚═════╝     ╚════╝  ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝
                                @x_walter
`;
console.clear();
console.log('\x1b[36m%s\x1b[0m', ascii); // Cyan color
// ───────────────────────

const filepath = './tokens.txt';

function sort(filepath) {
    const fileContent = fs.readFileSync(filepath, 'utf-8');
    return fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .sort();
}

async function checkTokens(tokens) {
    const validTokens = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        try {
            await axios.get('https://discord.com/api/v10/users/@me', {
                headers: {
                    Authorization: token
                }
            });
            console.log(`>>> TOKEN ${i + 1} IS VALID`);
            validTokens.push(token);
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.error(`>>> TOKEN ${i + 1} IS INVALID`);
            } else {
                console.error(`>>> ERROR CHECKING TOKEN ${i + 1}`, error.message);
            }
        }
    }
    return validTokens;
}

function ws_joiner(token) {
    let ws;
    let heartbeat;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const reconnectDelay = 5000; // 5 seconds

    function connect() {
        ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');

        ws.on('open', () => {
            const identifyPayload = {
                op: 2,
                d: {
                    token,
                    properties: {
                        $os: 'linux',
                        $browser: 'firefox',
                        $device: 'desktop'
                    },
                    intents: 513
                }
            };
            ws.send(JSON.stringify(identifyPayload));
        });

        ws.on('message', (msg) => {
            let payload = JSON.parse(msg);
            const { t, op, d } = payload;

            // Start Heartbeat
            if (op === 10) {
                heartbeat = setInterval(() => {
                    ws.send(JSON.stringify({ op: 1, d: null }));
                }, d.heartbeat_interval);
            }

            // VC Join on READY
            if (t === 'READY') {
                const voiceState = {
                    op: 4,
                    d: {
                        guild_id: config.GUILD_ID,
                        channel_id: config.VC_CHANNEL,
                        self_mute: config.MUTED,
                        self_deaf: config.DEAFEN
                    }
                };
                ws.send(JSON.stringify(voiceState));
                console.log(`\x1b[32m[SUCCESS]\x1b[0m ${token.slice(0, 25)}... JOINED VC`);
            }
        });

        ws.on('close', (code) => {
            console.warn(`\x1b[33m[WARN]\x1b[0m DISCONNECTED (Code: ${code})`);

            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Attempting to reconnect in ${reconnectDelay / 1000} seconds...`);
                setTimeout(connect, reconnectDelay);
            } else {
                console.error(`\x1b[31m[ERROR]\x1b[0m Max reconnect attempts reached. Stopping.`);
            }
        });

        ws.on('error', (err) => {
            console.error(`\x1b[31m[ERROR]\x1b[0m WebSocket Error: ${err.message}`);
            if (ws.readyState !== WebSocket.CLOSED) ws.close(); // Force reconnect
        });
    }

    connect(); // start connection
}

async function main() {
    const tokens = sort(filepath);
    const validTokens = await checkTokens(tokens);

    // Make sure each token gets its own WebSocket connection
    validTokens.forEach(token => {
        ws_joiner(token); // Each token gets a separate WebSocket
    });
}

main();
