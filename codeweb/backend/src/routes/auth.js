const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../config/db');

function isBcryptHash(value) {
    return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
}

// @route POST /api/auth/register
// @desc Register user
router.post('/register', async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !phone || !password) {
        return res.status(400).json({ message: 'Please enter all required fields' });
    }

    try {
        const pool = await poolPromise;
        if (!pool) return res.status(500).json({ message: 'Database connecting error' });

        // Check for existing user by Email or Phone
        const checkRequest = new sql.Request(pool);
        const userExists = await checkRequest
            .input('email', sql.VarChar, email)
            .input('phone', sql.VarChar, phone)
            .query(`SELECT UserID FROM Users WHERE Email = @email OR Phone = @phone`);

        if (userExists.recordset.length > 0) {
            return res.status(400).json({ message: 'User already exists with this email or phone' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert new user
        const insertRequest = new sql.Request(pool);
        const insertResult = await insertRequest
            .input('fullName', sql.NVarChar, fullName)
            .input('email', sql.VarChar, email)
            .input('phone', sql.VarChar, phone)
            .input('passwordHash', sql.VarChar, passwordHash)
            .query(`
                INSERT INTO Users (FullName, Email, Phone, PasswordHash, Role)
                OUTPUT inserted.UserID, inserted.FullName, inserted.Email, inserted.Role
                VALUES (@fullName, @email, @phone, @passwordHash, 'Customer')
            `);

        const user = insertResult.recordset[0];

        // Create JWT token
        const jwtSecret = process.env.JWT_SECRET || 'secret';
        const token = jwt.sign({ id: user.UserID, role: user.Role }, jwtSecret, { expiresIn: '1d' });

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: { id: user.UserID, fullName: user.FullName, email: user.Email, role: user.Role }
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// @route POST /api/auth/login
// @desc Authenticate user & get token
router.post('/login', async (req, res) => {
    const username = req.body.username?.trim();
    const password = req.body.password?.trim();

    if (!username || !password) {
        return res.status(400).json({ message: 'Please enter all fields' });
    }

    try {
        const pool = await poolPromise;
        if (!pool) return res.status(500).json({ message: 'Database connecting error' });

        // Find user by email or phone
        const request = new sql.Request(pool);
        const result = await request
            .input('username', sql.VarChar, username)
            .query(`SELECT UserID, FullName, Email, PasswordHash, Role FROM Users WHERE Email = @username OR Phone = @username`);

        const user = result.recordset[0];

        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Validate password
        const isHash = isBcryptHash(user.PasswordHash);
        const isMatch = isHash
            ? await bcrypt.compare(password, user.PasswordHash)
            : password === user.PasswordHash;

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (!isHash) {
            const newPasswordHash = await bcrypt.hash(password, 10);
            await pool
                .request()
                .input('userId', sql.Int, user.UserID)
                .input('passwordHash', sql.VarChar, newPasswordHash)
                .query(`UPDATE Users SET PasswordHash = @passwordHash WHERE UserID = @userId`);
        }

        // Create token
        const jwtSecret = process.env.JWT_SECRET || 'secret';
        const token = jwt.sign({ id: user.UserID, role: user.Role }, jwtSecret, { expiresIn: '1d' });

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.UserID, fullName: user.FullName, email: user.Email, role: user.Role }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error during login' });
    }
});

module.exports = router;
