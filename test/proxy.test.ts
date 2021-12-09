const { waffle, ethers } = require("hardhat");
import { Wallet, utils, BigNumber, providers } from "ethers"

import { Wallet__factory } from "../typechain/factories/Wallet__factory"

import { expect } from "chai"

const salts = [utils.formatBytes32String('1'), utils.formatBytes32String('2')]

const provider = waffle.provider

const getGas = async (tx) => {
  const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
  return receipt.gasUsed.toString()
}

describe('Wallet Factory Test', () => {
  const gasPrice = 20000
  let wallet
  let proxy
  let walletStandaloneGas
  let walletProxyGas

  let owner
  let signers

  before(async function() {
    [owner] = await ethers.getSigners();
    signers = [ Wallet.createRandom().address, Wallet.createRandom().address ]
  })
  it("Should deploy master wallet contract", async function () {
    wallet = await (await ethers.getContractFactory("Wallet")).deploy();
    await wallet.deployed()
    walletStandaloneGas = await getGas(wallet.deployTransaction)
    expect(wallet.address).to.exist;
  });

  it("Should deploy proxy contract", async function () {
    proxy = await (await ethers.getContractFactory("Proxy")).deploy(wallet.address);
    expect(proxy.address).to.exist;
  });


  it("Should deploy a cloned wallet contract and allow initialization of custom wallet info", async function () {
    // Get the expected address
    const walletAddress = await proxy.getAddress(salts[0]);
    expect(walletAddress).to.exist;

    const tx = await proxy.create(salts[0]);
    await tx.wait()
    walletProxyGas = await getGas(tx)

    const wallet1 = Wallet__factory.connect(walletAddress, owner)
    expect(wallet1.address).to.equal(walletAddress)


    let encoder = ethers.utils.defaultAbiCoder
    let data = encoder.encode(["address[]", "uint"], [signers, 2])

    let factory = await ethers.getContractFactory("ModuleRegistry")
    let registry = await factory.deploy()
    await registry.deployed()

    factory = await ethers.getContractFactory("SecurityModule")
    let sm = await factory.deploy(registry.address)
    await sm.deployed()

    let initTx = await wallet1.initialize([sm.address], [data], {
        gasLimit: 8000000, gasPrice: 1
    });
    await initTx.wait()

    await expect(wallet1.initialize([sm.address], [data])).to.be.revertedWith(
      "contract is already initialized"
    )

    expect(await wallet1.owner()).to.equal(owner.address)
  });

  it("Minimal Proxy deployment should cost 10x less than a standard deployment", async function () {
    expect(Number(walletStandaloneGas)).to.be.greaterThan(Number(walletProxyGas)*10)
  });
});