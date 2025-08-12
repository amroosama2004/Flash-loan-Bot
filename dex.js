// dex.js
const { ethers } = require('ethers');

const ROUTERS = {
  polygon: {
    quickswap: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    sushi: '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506'
  }
};

const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

function getRouterContract(provider, chain, routerKey) {
  const addr = ROUTERS[chain][routerKey];
  return new ethers.Contract(addr, ROUTER_ABI, provider);
}

async function getAmountsOut(provider, chain, routerKey, amountInRaw, path) {
  try {
    const router = getRouterContract(provider, chain, routerKey);
    const amounts = await router.getAmountsOut(amountInRaw, path);
    return amounts;
  } catch (e) {
    return null;
  }
}

module.exports = { getAmountsOut, getRouterContract };
