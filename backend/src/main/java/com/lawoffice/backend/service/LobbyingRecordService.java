package com.lawoffice.backend.service;

import com.lawoffice.backend.model.LobbyingRecord;

import java.util.List;

public interface LobbyingRecordService {
    
    List<LobbyingRecord> getAll();
    
    List<LobbyingRecord> getByClientId(Long clientId);
    
    LobbyingRecord getById(Long id);
    
    LobbyingRecord create(LobbyingRecord record, String actor);
    
    LobbyingRecord update(Long id, LobbyingRecord record, String actor);
    
    void delete(Long id);
}