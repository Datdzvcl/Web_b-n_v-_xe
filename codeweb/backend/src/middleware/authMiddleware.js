const jwt = require('jsonwebtoken');

function auth(req, res, next) {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        // Token format expected: "Bearer <token>"
        const actualToken = token.split(' ')[1] || token;

        const decoded = jwt.verify(actualToken, process.env.JWT_SECRET || 'secret');
        req.user = decoded; // { id, role }
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
}

function adminAuth(req, res, next) {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as an admin' });
    }
}

module.exports = { auth, adminAuth };
