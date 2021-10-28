import { ethers, waffle } from 'hardhat'
import { BigNumber, BigNumberish, constants } from 'ethers'
import chai from 'chai'
import { expect } from 'chai'
import { fixture, hypervisorTestFixture } from "./shared/fixtures"
import { solidity } from "ethereum-waffle"
import {lastBlock, increaseTime}  from './shared/ethUtils'

chai.use(solidity)

import {
    FeeAmount,
    TICK_SPACINGS,
    encodePriceSqrt,
    getPositionKey,
    getMinTick,
    getMaxTick
} from './shared/utilities'

import {
    SwapRouter,
    UniswapV3Factory,
    IUniswapV3Pool,
    HypervisorFactory,
    Hypervisor,
    NonfungiblePositionManager,
    TestERC20,
    Admin
} from "../typechain"

const createFixtureLoader = waffle.createFixtureLoader

describe('Admin', () => {
    const [wallet, alice, bob, carol, other,
           user0, user1, user2, user3, user4] = waffle.provider.getWallets()

    let factory: UniswapV3Factory
    let router: SwapRouter
    let nft: NonfungiblePositionManager
    let token0: TestERC20
    let token1: TestERC20
    let token2: TestERC20
    let uniswapPool: IUniswapV3Pool
    let hypervisorFactory: HypervisorFactory
    let hypervisor: Hypervisor
    let admin: Admin;

    let loadFixture: ReturnType<typeof createFixtureLoader>
    before('create fixture loader', async () => {
        loadFixture = createFixtureLoader([wallet, other])
    })

    beforeEach('deploy contracts', async () => {
        ({ token0, token1, token2, factory, router, nft, hypervisorFactory } = await loadFixture(hypervisorTestFixture))

        const adminFactory = await ethers.getContractFactory('Admin')
        admin = (await adminFactory.deploy(wallet.address, alice.address)) as Admin;

        await hypervisorFactory.createHypervisor(token0.address, token1.address, FeeAmount.MEDIUM,"Test Visor", "TVR");
        const hypervisorAddress = await hypervisorFactory.getHypervisor(token0.address, token1.address, FeeAmount.MEDIUM)
        hypervisor = (await ethers.getContractAt('Hypervisor', hypervisorAddress)) as Hypervisor

        const poolAddress = await factory.getPool(token0.address, token1.address, FeeAmount.MEDIUM)
        uniswapPool = (await ethers.getContractAt('IUniswapV3Pool', poolAddress)) as IUniswapV3Pool
        await uniswapPool.initialize(encodePriceSqrt('1', '1'))
        await hypervisor.setDepositMax(ethers.utils.parseEther('100000'), ethers.utils.parseEther('100000'))

        // adding extra liquidity into pool to make sure there's always
        // someone to swap with
        await token0.mint(carol.address, ethers.utils.parseEther('1000000000000'))
        await token1.mint(carol.address, ethers.utils.parseEther('1000000000000'))

        await token0.connect(carol).approve(nft.address, ethers.utils.parseEther('10000000000'))
        await token1.connect(carol).approve(nft.address, ethers.utils.parseEther('10000000000'))

        await nft.connect(carol).mint({
            token0: token0.address,
            token1: token1.address,
            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
            fee: FeeAmount.MEDIUM,
            recipient: carol.address,
            amount0Desired: ethers.utils.parseEther('10000000000'),
            amount1Desired: ethers.utils.parseEther('10000000000'),
            amount0Min: 0,
            amount1Min: 0,
            deadline: 2000000000,
        })
    })

    it('Only advisor can call rebalance', async () => {
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

        // alice should start with 0 hypervisor tokens
        let alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(0)

        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address)

        let token0hypervisor = await token0.balanceOf(hypervisor.address)
        let token1hypervisor = await token1.balanceOf(hypervisor.address)
        expect(token0hypervisor).to.equal(ethers.utils.parseEther('1000'))
        expect(token1hypervisor).to.equal(ethers.utils.parseEther('1000'))
        alice_liq_balance = await hypervisor.balanceOf(alice.address)
        console.log("alice liq balance: " + alice_liq_balance)
        // check that alice has been awarded liquidity tokens equal the
        // quantity of tokens deposited since their price is the same
        expect(alice_liq_balance).to.equal(ethers.utils.parseEther('2000'))

        await hypervisor.transferOwnership(admin.address);

        await expect(admin.rebalance(hypervisor.address, -120, 120, -60, 0, bob.address, 0)).to.be.revertedWith("only advisor");

        await admin.connect(alice).rebalance(hypervisor.address, -120, 120, -60, 0, bob.address, 0);

        token0hypervisor = await token0.balanceOf(hypervisor.address)
        token1hypervisor = await token1.balanceOf(hypervisor.address)
        expect(token0hypervisor).to.equal(0)
        expect(token1hypervisor).to.equal(0)

        let basePosition = await hypervisor.getBasePosition()
        let limitPosition = await hypervisor.getLimitPosition()
        expect(basePosition[0]).to.be.gt(0)
        expect(limitPosition[0]).to.be.equal(0)

        let tokenAmounts = await hypervisor.getTotalAmounts()
        expect(tokenAmounts[0] === tokenAmounts[1])
    })

    // it('Only admin can call emergencyWithdraw', async () => {
    //     await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
    //     await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

    //     await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
    //     await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

    //     // alice should start with 0 hypervisor tokens
    //     let alice_liq_balance = await hypervisor.balanceOf(alice.address)
    //     expect(alice_liq_balance).to.equal(0)

    //     await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address)

    //     let token0hypervisor = await token0.balanceOf(hypervisor.address)
    //     let token1hypervisor = await token1.balanceOf(hypervisor.address)
    //     expect(token0hypervisor).to.equal(ethers.utils.parseEther('1000'))
    //     expect(token1hypervisor).to.equal(ethers.utils.parseEther('1000'))
    //     alice_liq_balance = await hypervisor.balanceOf(alice.address)
    //     console.log("alice liq balance: " + alice_liq_balance)
    //     // check that alice has been awarded liquidity tokens equal the
    //     // quantity of tokens deposited since their price is the same
    //     expect(alice_liq_balance).to.equal(ethers.utils.parseEther('2000'))

    //     await hypervisor.transferOwnership(admin.address)

    //     await expect(admin.connect(alice).emergencyWithdraw(hypervisor.address, token0.address, ethers.utils.parseEther('1000'))).to.be.revertedWith("only admin")

    //     await admin.emergencyWithdraw(hypervisor.address, token0.address, ethers.utils.parseEther('1000'))

    //     token0hypervisor = await token0.balanceOf(hypervisor.address)
    //     token1hypervisor = await token1.balanceOf(hypervisor.address)
    //     expect(token0hypervisor).to.equal(0)
    //     expect(token1hypervisor).to.equal(ethers.utils.parseEther('1000'))
    //     expect(await token0.balanceOf(admin.address)).to.equal(ethers.utils.parseEther('1000'))

    //     await admin.rescueERC20(token0.address, bob.address);

    //     expect(await token0.balanceOf(bob.address)).to.equal(ethers.utils.parseEther('1000'))
    // })

    // it('Only admin can call emergencyBurn', async () => {
    //     await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
    //     await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

    //     await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
    //     await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

    //     // alice should start with 0 hypervisor tokens
    //     let alice_liq_balance = await hypervisor.balanceOf(alice.address)
    //     expect(alice_liq_balance).to.equal(0)

    //     await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address)

    //     let token0hypervisor = await token0.balanceOf(hypervisor.address)
    //     let token1hypervisor = await token1.balanceOf(hypervisor.address)
    //     expect(token0hypervisor).to.equal(ethers.utils.parseEther('1000'))
    //     expect(token1hypervisor).to.equal(ethers.utils.parseEther('1000'))
    //     alice_liq_balance = await hypervisor.balanceOf(alice.address)
    //     console.log("alice liq balance: " + alice_liq_balance)
    //     // check that alice has been awarded liquidity tokens equal the
    //     // quantity of tokens deposited since their price is the same
    //     expect(alice_liq_balance).to.equal(ethers.utils.parseEther('2000'))

    //     await hypervisor.transferOwnership(admin.address)

    //     await expect(admin.connect(alice).emergencyBurn(hypervisor.address, -120, 120, 0)).to.be.revertedWith("only admin")

    //     await expect(admin.emergencyBurn(hypervisor.address, -120, 120, 0)).to.be.revertedWith("NP");
    // })

    it('transfer Hypervisor Ownership', async () => {
        await token0.mint(alice.address, ethers.utils.parseEther('1000000'))
        await token1.mint(alice.address, ethers.utils.parseEther('1000000'))

        await token0.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))
        await token1.connect(alice).approve(hypervisor.address, ethers.utils.parseEther('1000000'))

        // alice should start with 0 hypervisor tokens
        let alice_liq_balance = await hypervisor.balanceOf(alice.address)
        expect(alice_liq_balance).to.equal(0)

        await hypervisor.connect(alice).deposit(ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), alice.address)

        let token0hypervisor = await token0.balanceOf(hypervisor.address)
        let token1hypervisor = await token1.balanceOf(hypervisor.address)
        expect(token0hypervisor).to.equal(ethers.utils.parseEther('1000'))
        expect(token1hypervisor).to.equal(ethers.utils.parseEther('1000'))
        alice_liq_balance = await hypervisor.balanceOf(alice.address)
        console.log("alice liq balance: " + alice_liq_balance)
        // check that alice has been awarded liquidity tokens equal the
        // quantity of tokens deposited since their price is the same
        expect(alice_liq_balance).to.equal(ethers.utils.parseEther('2000'))

        await hypervisor.transferOwnership(admin.address)

        const block: any = await lastBlock()
        // await expect(admin.prepareHVOwnertransfer(hypervisor.address, bob.address))
        //     .to.emit(admin, 'OwnerTransferPrepared')
        //     .withArgs(hypervisor.address, bob.address, wallet.address, parseInt(block.timestamp) + 1)
        // await expect(admin.fullfillHVOwnertransfer(hypervisor.address, bob.address)).to.be.reverted
        // increaseTime(86400)
        // await admin.fullfillHVOwnertransfer(hypervisor.address, bob.address)
        // expect(await hypervisor.owner()).to.eq(bob.address);
    })
})