const fs = require('fs');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const colors = require('colors');

const userInfoUrl = 'https://testnet.humanity.org/api/user/userInfo';
const claimRewardUrl = 'https://testnet.humanity.org/api/rewards/daily/claim';

const banner = () => {
    console.log(colors.cyan.bold('\n---------------------------------------------'));
    console.log(colors.cyan.bold('========= Humanity Auto Bot - Isbas ========='));
    console.log(colors.cyan.bold('---------------------------------------------'));
};

async function delayRandom(minSeconds = 5, maxSeconds = 10) {
    const seconds = Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
    await countdown(seconds);
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

async function tryRequestWithProxies(url, token, availableProxies, usedProxies) {
    const headers = {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json'
    };

    for (let i = 0; i < availableProxies.length; i++) {
        const proxy = availableProxies[i];
        if (usedProxies.has(proxy)) continue;

        const agent = new HttpsProxyAgent(proxy);
        try {
            const response = await axios.post(url, {}, {
                headers,
                httpsAgent: agent,
                proxy: false,
                timeout: 10000,
            });
            usedProxies.add(proxy);
            return { response, proxy };
        } catch (error) {
            if (
                error.code === 'ECONNABORTED' ||
                error.code === 'ETIMEDOUT' ||
                error.message.includes('timeout') ||
                error.code === 'ECONNREFUSED'
            ) {
                console.warn(`Proxy gagal (timeout/connection error): ${proxy}, mencoba proxy berikutnya...`);
                usedProxies.add(proxy);
                continue;
            } else {
                throw error;
            }
        }
    }

    throw new Error('❌ Semua proxy gagal digunakan. Tidak ada proxy yang bisa dipakai.');
}

async function processToken(token, allProxies, usedProxies, index) {
    token = token.trim();
    if (!token) return;

    console.log(`\n--- Account ${index + 1} ---`);

    try {
        // Dapatkan proxy yang berhasil untuk userInfo
        const { response: userInfoResp, proxy } = await tryRequestWithProxies(userInfoUrl, token, allProxies, usedProxies);
        const { msg, data } = userInfoResp.data;
        const { nickName, ethAddress, totalRewards, daily_reward } = data;

        console.log(`Using proxy  : ${proxy}`);
        console.log('Message      :', msg);
        console.log('Nickname     :', nickName);
        console.log('ETH Address  :', ethAddress);
        console.log('Total Reward :', totalRewards);
        console.log('Daily Reward :', daily_reward.available ? '✅ Available to claim' : '❌ Already claimed');

        if (daily_reward.available) {
            const claimAgent = new HttpsProxyAgent(proxy);
            const claimHeaders = {
                'accept': 'application/json',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json'
            };

            const claimResponse = await axios.post(claimRewardUrl, {}, {
                headers: claimHeaders,
                httpsAgent: claimAgent,
                proxy: false,
                timeout: 10000,
            });

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
                const allProxies = proxyContent.split('\n').filter(Boolean);
                const usedProxies = new Set();

                if (tokens.length > allProxies.length) {
                    console.warn('⚠️ Jumlah token melebihi jumlah proxy. Beberapa proxy mungkin dipakai ulang jika semua gagal.');
                }

                for (let i = 0; i < tokens.length; i++) {
                    await processToken(tokens[i], allProxies, usedProxies, i);
                    await delayRandom(5, 10);
                }

                resolve();
            });
        });
    });
}

async function mainLoop() {
    banner();
    while (true) {
        console.log(`\n=== Starting Process ${new Date().toLocaleString()} ===`);
        try {
            await runProcess();
            console.log(`\n=== All Account Process Finished At ${new Date().toLocaleString()} ===`);
        } catch (err) {
            console.error('\nError:', err);
        }

        await countdown(24 * 60 * 60); // tunggu 24 jam
    }
}

mainLoop();