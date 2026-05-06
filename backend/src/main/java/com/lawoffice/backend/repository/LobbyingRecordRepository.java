package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.LobbyingRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LobbyingRecordRepository extends JpaRepository<LobbyingRecord, Long> {
    
    @Query("SELECT lr FROM LobbyingRecord lr WHERE lr.client.id = :clientId AND lr.organization.id = :organizationId ORDER BY lr.lobbyingDate DESC, lr.createdAt DESC")
    List<LobbyingRecord> findByClientIdAndOrganizationIdOrderByLobbyingDateDesc(@Param("clientId") Long clientId, @Param("organizationId") Long organizationId);

    @Query("SELECT lr FROM LobbyingRecord lr WHERE lr.organization.id = :organizationId ORDER BY lr.lobbyingDate DESC, lr.createdAt DESC")
    List<LobbyingRecord> findAllByOrganizationIdOrderByLobbyingDateDesc(@Param("organizationId") Long organizationId);

    @Query("SELECT lr FROM LobbyingRecord lr WHERE lr.id = :id AND lr.organization.id = :organizationId")
    java.util.Optional<LobbyingRecord> findByIdAndOrganizationId(@Param("id") Long id, @Param("organizationId") Long organizationId);
}
