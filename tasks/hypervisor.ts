import { expect } from 'chai'
import { constants, Wallet } from 'ethers'
import { formatEther, parseEther} from 'ethers/lib/utils'
import { task } from 'hardhat/config'
import { deployContract, signPermission } from './utils'
import {
    FeeAmount,
    TICK_SPACINGS,
    encodePriceSqrt,
    getPositionKey,
    getMinTick,
    getMaxTick
} from './shared/utilities'


const DAY = 60 * 60 * 24


task('deploy-admin', 'Deploy Hypervisor contract')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))
    console.log('Network')
    console.log('  ', network.name)

    const admin = await deployContract(
      'Admin',
      await ethers.getContractFactory('Admin'),
      signer,
      [signer.address, "0xC3D6b5443F77f07cEa1bd8A4449F17FcCA7f55fc"]
    )

    await admin.deployTransaction.wait(5)
    await run('verify:verify', {
      address: admin.address,
      constructorArguments: [signer.address, "0xC3D6b5443F77f07cEa1bd8A4449F17FcCA7f55fc"],
    })

});

task('deploy-hypervisor-factory', 'Deploy Hypervisor contract')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    //TODO cli args
    // goerli
    const args = {
      uniswapFactory: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
    };

    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    // deploy contracts

    const hypervisorFactoryFactory = await ethers.getContractFactory('HypervisorFactory')

    const hypervisorFactory = await deployContract(
      'HypervisorFactory',
      await ethers.getContractFactory('HypervisorFactory'),
      signer,
      [args.uniswapFactory]
    )

    await hypervisorFactory.deployTransaction.wait(5)
    await run('verify:verify', {
      address: hypervisorFactory.address,
      constructorArguments: [args.uniswapFactory],
    })
})

task('deploy-hypervisor', 'Deploy Hypervisor contract')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    // compile

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    //usdceth 3%
    const args = {
      pool: "0x17c14d2c404d167802b16c450d3c99f88f2c4f4d",
      owner: signer.address,
      name: "Visor USDC-ETH Uni v3",
      symbol: "vUSDC-ETHV3-1"
    }


    console.log('Network')
    console.log('  ', network.name)
    console.log('Task Args')
    console.log(args)



    const hypervisor = await deployContract(
      'Hypervisor',
      await ethers.getContractFactory('Hypervisor'),
      signer,
      [args.pool, args.owner, args.name, args.symbol]
    )

    await hypervisor.deployTransaction.wait(5)
    await run('verify:verify', {
      address: hypervisor.address,
      constructorArguments: [args.pool, args.owner, args.name, args.symbol],
    })

  }); 

task('verify-hypervisor', 'Deploy Hypervisor contract')
  .setAction(async (cliArgs, { ethers, run, network }) => {

    console.log('Network')
    console.log('  ', network.name)

    await run('compile')

    // get signer

    const signer = (await ethers.getSigners())[0]
    console.log('Signer')
    console.log('  at', signer.address)
    console.log('  ETH', formatEther(await signer.getBalance()))

    const hypervisorAddress = "0x167427158D4b1F6264d4dfaE79dB6f44b321386e";

    const args = {
      pool: "0xc82819f72a9e77e2c0c3a69b3196478f44303cf4",
      owner: signer.address,
      name: "Visor ETH-USDT Uni v3",
      symbol: "vETH-USDTV3-1"
    };
    console.log('Task Args')
    console.log(args)

    const hypervisor = await ethers.getContractAt(
      'Hypervisor',
      hypervisorAddress,
      signer,
    )

    await run('verify:verify', {
      address: hypervisor.address,
      constructorArguments: Object.values(args),
    })

  });



