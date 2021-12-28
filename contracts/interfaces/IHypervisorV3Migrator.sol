// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

/// @title Hypervisor V3 Migrator
/// @notice Enables migration of liqudity from Uniswap v2-compatible pairs into Hypervisor
interface IHypervisorV3Migrator {

    /// @notice Migrates uniswap v2 liquidity to hypervisor by burning v2 liquidity and depositing to hypervisor
    /// @param _hypervisor The address of the Hypervisor
    /// @param percentageToMigrate Number represents the percentage to migrate
    /// @param recipient Recipient's address
    function migrate(address _hypervisor, uint8 percentageToMigrate, address recipient) external;
}
