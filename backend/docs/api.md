# API Documentation

Base URL: `http://localhost:8000/api`

## Auth
### POST /auth/login
Authenticate user and return a Sanctum token.

**Request**
```json
{
  "username": "admin",
  "password": "Admin123!"
}
```

**Response**
```json
{
  "token": "...",
  "user": {"id": 1, "username": "admin"}
}
```

### POST /auth/logout
Invalidate the current token.

## Users
### GET /users
List users (admin only).

### POST /users
Create a user (admin only).

### GET /users/{id}
Show user details.

### PUT /users/{id}
Update a user.

### DELETE /users/{id}
Delete a user.

## Roles
### GET /roles
List roles.

### POST /roles
Create a role.

### PUT /roles/{id}
Update a role.

### DELETE /roles/{id}
Delete a role.

## Permissions
### GET /permissions
List permissions.

### POST /permissions
Create a permission.

### PUT /permissions/{id}
Update a permission.

### DELETE /permissions/{id}
Delete a permission.

## Guests
### GET /guests
List guests.

### POST /guests
Create guest (resolves Person by email).

### PUT /guests/{id}
Update guest.

## People
### GET /people/{id}
Show person profile.

### PUT /people/{id}
Update person profile.
