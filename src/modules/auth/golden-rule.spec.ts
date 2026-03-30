// Golden Rule Test - Demonstrates liberal acceptance, conservative response

describe('Golden Rule Implementation', () => {
  describe('Liberal in what we accept', () => {
    it('should accept and normalize email variations', async () => {
      const variations = [
        '  Sophie@EXAMPLE.com  ',    // Spaces + caps
        'sophie@example.com',        // Normal
        'SOPHIE@EXAMPLE.COM',        // All caps
      ];

      for (const email of variations) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email,
            password: 'password123',
            extraField: 'ignored',      // ✅ Extra field ignored
            anotherField: { nested: 'object' }  // ✅ Complex extra field ignored
          })
          .expect(201);

        expect(response.body.user.email).toBe('sophie@example.com');
      }
    });

    it('should not throw errors for unknown fields', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          // Simulate future client sending new fields
          deviceId: 'mobile-123',
          appVersion: '2.0.0',
          userAgent: 'FreelanceFlow-Mobile/2.0.0',
          timestamp: Date.now(),
          randomData: { foo: 'bar', nested: { deep: 'value' } }
        })
        .expect(201); // ✅ Should succeed, not fail
    });
  });

  describe('Conservative in what we send', () => {
    it('should never leak sensitive data', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(201);

      // ✅ Should include safe user data
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.id).toBeDefined();

      // ✅ Should never leak sensitive data
      expect(response.body.user.password).toBeUndefined();
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(response.body.passwordHash).toBeUndefined();
      expect(response.body.refreshToken).toBeUndefined();
    });

    it('should provide French error messages', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: '123' // Too short
        })
        .expect(400);

      expect(response.body.message).toContain('L\'email doit être une adresse email valide');
      expect(response.body.message).toContain('Le mot de passe doit contenir au moins 8 caractères');
      expect(response.body.error).toBe('Requête Invalide');
    });
  });

  describe('API Evolution Safety', () => {
    it('should handle requests from different client versions', async () => {
      // Simulate old client (minimal fields)
      const oldClientResponse = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'old@client.com',
          password: 'password123'
        })
        .expect(201);

      // Simulate new client (extra fields)
      const newClientResponse = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'new@client.com',
          password: 'password123',
          displayName: 'New User',
          deviceInfo: { model: 'iPhone 15', os: 'iOS 17' },
          preferences: { notifications: true, theme: 'dark' }
        })
        .expect(201);

      // ✅ Both should work identically
      expect(oldClientResponse.body.user.email).toBe('old@client.com');
      expect(newClientResponse.body.user.email).toBe('new@client.com');
      
      // ✅ Response structure should be identical
      expect(Object.keys(oldClientResponse.body)).toEqual(
        Object.keys(newClientResponse.body)
      );
    });
  });
});