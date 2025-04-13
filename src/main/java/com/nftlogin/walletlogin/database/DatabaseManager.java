package com.nftlogin.walletlogin.database;

import org.bukkit.entity.Player;

import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

/**
 * Interface for database operations.
 */
public interface DatabaseManager {

    /**
     * Connects to the database.
     *
     * @throws SQLException if a database access error occurs
     */
    void connect() throws SQLException;

    /**
     * Creates the necessary tables in the database.
     *
     * @throws SQLException if a database access error occurs
     */
    void createTables() throws SQLException;

    /**
     * Checks if a player is registered.
     *
     * @param uuid The player's UUID
     * @return true if the player is registered, false otherwise
     */
    boolean isPlayerRegistered(UUID uuid);

    /**
     * Registers a new player.
     *
     * @param player The player
     * @param password The password
     * @return true if registration was successful, false otherwise
     */
    boolean registerPlayer(Player player, String password);

    /**
     * Authenticates a player.
     *
     * @param uuid The player's UUID
     * @param password The password
     * @return true if authentication was successful, false otherwise
     */
    boolean authenticatePlayer(UUID uuid, String password);

    /**
     * Updates a player's password.
     *
     * @param uuid The player's UUID
     * @param newPassword The new password
     * @return true if the update was successful, false otherwise
     */
    boolean updatePassword(UUID uuid, String newPassword);

    /**
     * Updates a player's last login time.
     *
     * @param uuid The player's UUID
     * @param ip The player's IP address
     */
    void updateLastLogin(UUID uuid, String ip);

    /**
     * Saves a player's session.
     *
     * @param uuid The player's UUID
     * @param ip The player's IP address
     */
    void saveSession(UUID uuid, String ip);

    /**
     * Removes a player's session.
     *
     * @param uuid The player's UUID
     */
    void removeSession(UUID uuid);

    /**
     * Saves a player's data.
     *
     * @param player The player
     */
    void savePlayer(Player player);

    /**
     * Connects a wallet to a player's account.
     *
     * @param uuid The player's UUID
     * @param walletAddress The wallet address
     * @param walletType The wallet type
     * @return true if the connection was successful, false otherwise
     */
    boolean connectWallet(UUID uuid, String walletAddress, String walletType);

    /**
     * Disconnects a wallet from a player's account.
     *
     * @param uuid The player's UUID
     * @return true if the disconnection was successful, false otherwise
     */
    boolean disconnectWallet(UUID uuid);

    /**
     * Gets a player's wallet address.
     *
     * @param uuid The player's UUID
     * @return The wallet address, or empty if the player doesn't have a wallet connected
     */
    Optional<String> getWalletAddress(UUID uuid);

    /**
     * Gets a player's wallet type.
     *
     * @param uuid The player's UUID
     * @return The wallet type, or empty if the player doesn't have a wallet connected
     */
    Optional<String> getWalletType(UUID uuid);

    /**
     * Checks if a player has a wallet connected.
     *
     * @param uuid The player's UUID
     * @return true if the player has a wallet connected, false otherwise
     */
    boolean hasWalletConnected(UUID uuid);

    /**
     * Sets a wallet as verified.
     *
     * @param uuid The player's UUID
     * @param verified Whether the wallet is verified
     * @return true if the update was successful, false otherwise
     */
    boolean setWalletVerified(UUID uuid, boolean verified);

    /**
     * Checks if a player's wallet is verified.
     *
     * @param uuid The player's UUID
     * @return true if the wallet is verified, false otherwise
     */
    boolean isWalletVerified(UUID uuid);

    /**
     * Closes the database connection.
     *
     * @throws SQLException if a database access error occurs
     */
    void closeConnection() throws SQLException;
}
