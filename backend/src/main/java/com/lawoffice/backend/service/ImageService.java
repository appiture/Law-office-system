package com.lawoffice.backend.service;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;
import java.util.HashMap;

@Service
public class ImageService {

    public Map<String, Object> uploadImage(MultipartFile file) throws Exception {
        Map<String, Object> result = new HashMap<>();
        
        // Return a data URL for the demo so file content is "visible"
        String prefix = "data:" + file.getContentType() + ";base64,";
        String base64 = java.util.Base64.getEncoder().encodeToString(file.getBytes());
        
        result.put("secure_url", prefix + base64);
        result.put("public_id", "demo_id_" + System.currentTimeMillis());
        return result;
    }

    public void deleteImage(String publicId) throws Exception {
        // Mock delete - do nothing
    }
}
