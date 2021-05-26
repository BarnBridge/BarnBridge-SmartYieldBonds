// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { Wallet, BigNumber } = require('ethers');

const erc20abi = require("./abis/erc20abi.json");
const idleTokenAbi = require("./abis/idletokenabi.json");

const A_HOUR = 60 * 60;
const seniorBondCONF = { name: 'BarnBridge IdleDAI sBOND', symbol: 'bbsidleDAI' };
const juniorBondCONF = { name: 'BarnBridge IdleDAI jBOND', symbol: 'bbjidleDAI' };
const juniorTokenCONF = { name: 'BarnBridge IdleDai', symbol: 'bbidleDAI' };
const oracleCONF = { windowSize: A_HOUR, granularity: 4 };
const decimals = 18; // same as DAI
// const dao = '0x0';
// const feesOwner = dao;
const IDLE_DAI_CONTRACT = "0x3fe7940616e5bc47b0775a0dccf6237893353bb4";
const IDLE_GOV_TOKEN = "0x875773784Af8135eA0ef43b5a374AaD105c5D39e";
const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const DAI_MILLIONAIRE = '0xf977814e90da44bfa03b6295a0616a897441acec';

//const uniswapPath = [IDLE_GOV_TOKEN, WETH, DAI_ADDRESS];

async function main() {
    const [deployerSign, ...signers] = (await ethers.getSigners());
    //console.log('Deployer:', deployerSign.address);
    //console.log('Others:', signers.map(a => a.address));
    const dao = deployerSign.address;
    const feesOwner = dao;
    const BondModel = await hre.ethers.getContractFactory("BondModelV1");
    const bondModel = await BondModel.deploy();
    await bondModel.deployed();
    const Provider = await hre.ethers.getContractFactory("IdleProvider");
    const pool = await Provider.deploy(IDLE_DAI_CONTRACT, DAI_ADDRESS);
    await pool.deployed();
    const SmartYield = await hre.ethers.getContractFactory("SmartYield");
    const smartYield = await SmartYield.deploy(juniorTokenCONF.name, juniorTokenCONF.symbol, BigNumber.from(decimals));
    await smartYield.deployed();
    const SeniorBond = await hre.ethers.getContractFactory("SeniorBond");
    const seniorBond = await SeniorBond.deploy(smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol);
    await seniorBond.deployed();
    const JuniorBond = await hre.ethers.getContractFactory("JuniorBond");
    const juniorBond = await JuniorBond.deploy(smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol);
    await juniorBond.deployed();
    const Controller = await hre.ethers.getContractFactory("IdleController");
    const controller = await Controller.deploy(pool.address, smartYield.address, bondModel.address, deployerSign.address);
    await controller.deployed();
    const Oracle = await hre.ethers.getContractFactory("YieldOracle");
    const oracle = await Oracle.deploy(controller.address, oracleCONF.windowSize, oracleCONF.granularity);
    await oracle.deployed();
    await controller.setOracle(oracle.address);
    await controller.setFeesOwner(feesOwner);
    await smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address);
    await pool.setup(smartYield.address, controller.address);

    await controller.setGuardian(dao);
    await controller.setDao(dao);

    console.log('================EXTERNAL ADDRESSES=================');
    console.log('DAO:', dao);
    console.log('IdleDAI:', IDLE_DAI_CONTRACT);
    console.log('IdleGov:', IDLE_GOV_TOKEN);
    console.log('DAI:', DAI_ADDRESS);
    console.log('WETH:', WETH);
    console.log('===================================================');
    console.log('=====================DEPLOYED======================');
    console.log('bondModel:', bondModel.address);
    console.log('idleProvider:', pool.address);
    console.log('smartYield:', smartYield.address);
    console.log('seniorBond:', seniorBond.address);
    console.log('juniorBond:', juniorBond.address);
    console.log('idleController:', controller.address);
    console.log('oracle:', oracle.address);
    console.log('===================================================');

    //console.log('===================TRANSACTIONS====================');
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [DAI_MILLIONAIRE]}
    )

    let signer = await ethers.provider.getSigner(DAI_MILLIONAIRE);
    //let idleContract = new ethers.Contract(idleAddress, erc20abi, signer);
    let daiContract = new ethers.Contract(DAI_ADDRESS, erc20abi, signer);
    console.log("Tranfer DAI from DAI millionaire to deployer...");
    await daiContract.transfer(deployerSign.address, daiContract.balanceOf(signer._address));
    daiContract = new ethers.Contract(DAI_ADDRESS, erc20abi, deployerSign);
    console.log("Approve Idle Provider to spend DAI...")
    await daiContract.approve(pool.address, daiContract.balanceOf(deployerSign.address));
    ts = Math.floor(Date.now() / 1000);
    idleDai = new ethers.Contract("0x3fe7940616e5bc47b0775a0dccf6237893353bb4", idleTokenAbi, deployerSign);
    //console.log("Idle Average APR: " + BigNumber.from(await idleDai.getAvgAPR()).toString());
    console.log("Buying Junior Tokens...");
    await smartYield.buyTokens(e18(10), 1, ts+180);
    //console.log(await smartYield.balanceOf(deployerSign.address));

    // await smartYield.buyJuniorBond(smartYield.balanceOf(deployerSign.address), e18(ts+10*24*60*60), e18(ts+600));
    console.log("Buying Senior Bond...");
    await smartYield.buyBond(e18(1), 0, e18(ts+180), 10);

    console.log("Check senior bond added...");
    console.log("Owner of Senior Bond NFT 1: " + (await seniorBond.ownerOf(1)));
    var daiBalance = BigNumber.from(await daiContract.balanceOf(deployerSign.address)).toString();
    //console.log(daiBalance);
    console.log("Approving junior tokens...");
    var juniorTokenBalance = await smartYield.balanceOf(deployerSign.address);
    //console.log(BigNumber.from(juniorTokenBalance).toString());
    await smartYield.approve(pool.address, juniorTokenBalance);
    console.log("Junior Tokens Sale...");
    await smartYield.sellTokens(1, 0, ts+600);
    console.log("Buy Junior Bond...");
    juniorTokenBalance = await smartYield.balanceOf(deployerSign.address);
    await smartYield.buyJuniorBond(juniorTokenBalance, ts+50*24*60*60, ts+600);
    var daiBalance2 = BigNumber.from(await daiContract.balanceOf(deployerSign.address)).toString();
    //console.log(daiBalance2);
    console.log("Idle Average APR: " + BigNumber.from(await idleDai.getAvgAPR()).toString());
    console.log("SY abondGain: " + BigNumber.from(await smartYield.abondGain()).toString());
    console.log("SY abondPaid: " + BigNumber.from(await smartYield.abondPaid()).toString());
    console.log("SY abondDebt: " + BigNumber.from(await smartYield.abondDebt()).toString());
    // console.log("SeniorBond bought");

    //console.log('===================================================');
}

const e18 = (n) => {
    return ethers.utils.parseEther(n.toString());
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
