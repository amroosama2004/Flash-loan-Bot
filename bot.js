import 'dotenv/config';
import axios from 'axios';
import { ethers } from 'ethers';
import twilio from 'twilio';

// إعداد بياناتك من ملف .env
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// دالة بسيطة لاختبار الاتصال
async function main() {
    console.log("🚀 البوت بدأ العمل...");
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 رصيدك: ${ethers.formatEther(balance)} MATIC`);
}

main().catch(console.error);
