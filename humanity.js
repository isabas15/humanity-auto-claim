const fs = require('fs');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const userInfoUrl = 'https://testnet.humanity.org/api/user/userInfo';
const claimRewardUrl = 'https://testnet.humanity.org/api/rewards/daily/claim';

function delayRandom(minSeconds = 5, maxSeconds = 10) {
    const ms = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

function countdown(seconds) {
    return new Promise(resolve => {
        let remaining = seconds;
        const interval = setInterval(() => {
            process.stdout.write(`\rWaiting ${remaining} Seconds . . .!!!`);
            remaining--;
            if (remaining < 0) {
                clearInterval(interval);
                process.stdout.write('\r' + ' '.repeat(40) + '\r');
                resolve();
            }
        }, 1000);
    });
}


async function tryRequestWithProxies(url, token, proxies) {
    const headers = {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json'
    };

    for (let i = 0; i < proxies.length; i++) {
        const proxy = proxies[i];
        const agent = proxy ? new HttpsProxyAgent(proxy) : null;

        try {
            const response = await axios.post(url, {}, {
                headers,
                httpsAgent: agent,
                proxy: false,
                timeout: 10000,
            });
            return response;
        } catch (error) {
            if (
                error.code === 'ECONNABORTED' ||
                error.code === 'ETIMEDOUT' ||
                error.message.includes('timeout') ||
                error.code === 'ECONNREFUSED'
            ) {
                console.warn(`Proxy gagal (timeout/connection error): ${proxy}, mencoba proxy berikutnya...`);
                continue;
            } else {
                throw error;
            }
        }
    }

    throw new Error('❌ Semua proxy gagal digunakan. Tidak ada proxy yang bisa dipakai.');
}

async function processToken(token, proxy, index) {
    token = token.trim();
    if (!token) return;

    console.log(`\n--- Account ${index + 1} ---`);

    try {
        const response = await tryRequestWithProxies(userInfoUrl, token, [proxy]);
        const { msg, data } = response.data;
        const { nickName, ethAddress, daily_reward } = data;

        console.log(`Using proxy  : ${proxy}`);
        console.log('Message      :', msg);
        console.log('Nickname     :', nickName);
        console.log('ETH Address  :', ethAddress);
        console.log('Daily Reward :', daily_reward.available ? 'Daily reward available to claim' : 'Daily reward already claimed today');

        if (daily_reward.available) {
            const claimResponse = await tryRequestWithProxies(claimRewardUrl, token, [proxy]);
            console.log('Claim Status :', claimResponse.data.message);
        } else {
            console.log('Reward not available, skip claim process.');
        }

    } catch (err) {
        if (err.message.includes('Semua proxy gagal')) {
            console.error(err.message);
            process.exit(1);
        } else if (err.response) {
            console.error('Error Response:', err.response.status, err.response.data);
        } else {
            console.error('Request Error:', err.message);
        }
    }
}

async function runProcess() {
    return new Promise((resolve, reject) => {
        fs.readFile('token.txt', 'utf8', (err, tokenContent) => {
            if (err) return reject('Gagal membaca file token.txt: ' + err);

            fs.readFile('proxy.txt', 'utf8', async(err2, proxyContent) => {
                if (err2) return reject('Gagal membaca file proxy.txt: ' + err2);

                const tokens = tokenContent.split('\n').filter(Boolean);
                const proxiesList = proxyContent.split('\n').filter(Boolean);

                if (tokens.length > proxiesList.length) {
                    console.error(`❌ Jumlah token (${tokens.length}) lebih banyak dari jumlah proxy (${proxiesList.length}).`);
                    return process.exit(1);
                }

                for (let i = 0; i < tokens.length; i++) {
                    const proxy = proxiesList[i];
                    await processToken(tokens[i], proxy, i);
                    await delayRandom(5, 10);
                }

                resolve();
            });
        });
    });
}

async function mainLoop() {
    while (true) {
        console.log(`\n=== Starting Process ${new Date().toLocaleString()} ===`);

        try {
            await runProcess();
            console.log(`\n=== All Account Process Finished At ${new Date().toLocaleString()} ===`);
        } catch (err) {
            console.error('\nError:', err);
        }

        await countdown(24 * 60 * 60);
    }
}

mainLoop();