const { Wallet } = require('ethers');

const wallet = Wallet.createRandom();

console.log('BSC private key:', wallet.privateKey);
console.log('BSC address:', wallet.address);
