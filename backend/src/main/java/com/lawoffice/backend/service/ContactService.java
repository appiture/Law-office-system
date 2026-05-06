package com.lawoffice.backend.service;

import com.lawoffice.backend.model.Contact;

import java.util.List;

public interface ContactService {
    
    List<Contact> getAll();
    
    Contact getById(Long id);
    
    Contact create(Contact contact, String actor);
    
    Contact update(Long id, Contact contact, String actor);
    
    void delete(Long id);
}