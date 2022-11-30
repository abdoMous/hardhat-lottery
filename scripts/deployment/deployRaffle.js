const { ethers, network, run } = require("hardhat")
const fs = require("fs")

const FRONTEND_ADDRESSES_FILE = "../nextjs-lottery/constants/contractAddresses.json"
const FRONTEND_ABI_FILE = "../nextjs-lottery/constants/abi.json"

const {
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
    networkConfig,
} = require("../../helper-hardhat-config")

async function deployRaffle(chainId) {
    let VRFCoordinatorV2Mock
    let subscriptionId
    let vrfCoordinatorAddress

    if (chainId == 31337) {
        const BASE_FEE = "100000000000000000"
        const GAS_PRICE_LINK = "1000000000" // 0.000000001 LINK per gas

        const VRFCoordinatorV2MockFactory = await ethers.getContractFactory("VRFCoordinatorV2Mock")
        VRFCoordinatorV2Mock = await VRFCoordinatorV2MockFactory.deploy(BASE_FEE, GAS_PRICE_LINK)
        vrfCoordinatorAddress = VRFCoordinatorV2Mock.address
        console.log("vrfCoordinatorAddress=", vrfCoordinatorAddress)
        const fundAmount = networkConfig[chainId]["fundAmount"] || "1000000000000000000"
        const transaction = await VRFCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transaction.wait(1)
        subscriptionId = ethers.BigNumber.from(transactionReceipt.events[0].topics[1])
        await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, fundAmount)
    } else {
        subscriptionId = networkConfig[chainId]["subscriptionId"]
        vrfCoordinatorAddress = networkConfig[chainId]["vrfCoordinator"]
    }

    const { raffleEntranceFee, keyHash, interval } = networkConfig[chainId]

    const raffleFactory = await ethers.getContractFactory("Raffle")
    const arguments = [subscriptionId, vrfCoordinatorAddress, keyHash, raffleEntranceFee, interval]

    const raffle = await raffleFactory.deploy(...arguments)

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS

    await raffle.deployTransaction.wait(waitBlockConfirmations)

    console.log(`Raffle Contract deployed to ${raffle.address} on ${network.name}`)

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await run("verify:verify", {
            address: raffle.address,
            constructorArguments: arguments,
        })
    }

    if (chainId == 31337) {
        await VRFCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }

    if (process.env.UPDATE_FRONT_END) {
        console.log("updating contractAddresses.json and abi.jsaon")
        await updateContractAddresses(raffle, chainId)
        await updateAbi(raffle)
    }
}

async function updateContractAddresses(contract, chainId) {
    const currrentAddresses = JSON.parse(fs.readFileSync(FRONTEND_ADDRESSES_FILE, "utf8"))
    if (chainId in currrentAddresses) {
        if (!currrentAddresses[chainId]) {
            currrentAddresses[chainId].push(contract.address)
        }
    } else {
        currrentAddresses[chainId] = [contract.address]
    }

    fs.writeFileSync(FRONTEND_ADDRESSES_FILE, JSON.stringify(currrentAddresses))
}

async function updateAbi(contract) {
    fs.writeFileSync(FRONTEND_ABI_FILE, contract.interface.format(ethers.utils.FormatTypes.json))
}

module.exports = {
    deployRaffle,
}
