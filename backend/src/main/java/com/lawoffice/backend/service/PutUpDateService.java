package com.lawoffice.backend.service;

import com.lawoffice.backend.model.PutUpDate;

import java.time.LocalDateTime;
import java.util.List;

public interface PutUpDateService {
    
    List<PutUpDate> getAll();
    
    List<PutUpDate> getByCaseId(Long caseId);
    
    List<PutUpDate> getByDateRange(LocalDateTime fromDate, LocalDateTime toDate);
    
    PutUpDate getById(Long id);
    
    PutUpDate create(PutUpDate putUpDate, String actor);
    
    PutUpDate update(Long id, PutUpDate putUpDate, String actor);
    
    void delete(Long id);
}