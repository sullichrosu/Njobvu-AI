# Njobvu-AI Test Environment Setup

This document provides comprehensive instructions for setting up and running the test environment for the Njobvu-AI labeling tool project.

## Prerequisites

Before setting up the test environment, ensure you have the following installed:

- **Node.js** (version 14 or higher)
- **npm** (comes with Node.js)
- **Git** (for cloning the repository)

## Installation

1. **Clone the repository** (if not already done):

   ```bash
   git clone <repository-url>
   cd Njobvu-AI
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Verify installation**:
   ```bash
   npm test
   ```

## Test Environment Configuration

### Jest Configuration

The project uses Jest as the testing framework with the following configuration (`jest.config.js`):

```javascript
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  testPathIgnorePatterns: ["/node_modules/"],
};
```

### Test Dependencies

The following testing dependencies are included in `package.json`:

- **Jest** (^29.7.0) - JavaScript testing framework
- **Supertest** (^7.1.1) - HTTP assertion library for testing Express.js applications

## Test Structure

### Directory Structure

```
tests/
└── integration/
    ├── auth.test.js          # Authentication and user management tests
    ├── config.test.js        # Configuration and settings tests
    ├── projects.test.js      # Project management tests
    ├── root.test.js          # Root route and basic functionality tests
    └── validation.test.js    # Validation system tests
```

### Test File Summaries

#### 1. `auth.test.js` (196 lines)

**Purpose**: Tests authentication and user management functionality

**Key Test Areas**:

- User signup process (valid and invalid scenarios)
- User login with valid and invalid credentials
- Password hashing and verification
- User existence validation
- Session management

**Test Coverage**:

- GET `/signup` - Signup page rendering
- POST `/login` - User authentication
- POST `/signup` - User registration
- Error handling for existing users
- Password validation and hashing

#### 2. `config.test.js` (445 lines)

**Purpose**: Tests configuration and settings management

**Key Test Areas**:

- Project configuration pages
- Settings management
- Access control for configuration routes
- Error handling for invalid configurations

**Test Coverage**:

- GET `/config` - Main configuration page
- GET `/config/projSettings` - Project settings
- GET `/config/accessSettings` - Access settings
- GET `/config/classSettings` - Class settings
- GET `/config/imagesSettings` - Image settings
- GET `/config/mergeSettings` - Merge settings
- Authentication and authorization checks

#### 3. `projects.test.js` (192 lines)

**Purpose**: Tests project management functionality

**Key Test Areas**:

- Project creation and deletion
- Project access management
- Admin role transfers
- Project data manipulation

**Test Coverage**:

- POST `/createP` - Project creation
- POST `/deleteProject` - Project deletion
- POST `/removeAccess` - Access removal
- POST `/transferAdmin` - Admin transfer
- Database operations for projects

#### 4. `root.test.js` (74 lines)

**Purpose**: Tests basic application functionality and root routes

**Key Test Areas**:

- Application startup and basic routing
- Login page rendering
- Database connectivity
- Error handling for basic operations

**Test Coverage**:

- GET `/` - Root route and login page
- Database autosave functionality
- Error handling for database failures
- Authentication redirects (skipped test)

#### 5. `validation.test.js` (556 lines)

**Purpose**: Tests the validation system functionality

**Key Test Areas**:

- Validation mode management
- Label validation operations
- Class name changes (batch and individual)
- Validation page routing

**Test Coverage**:

- POST `/changeValidation` - Validation mode toggle
- POST `/deleteLabelValidation` - Label deletion (skipped)
- POST `/batch-change-class` - Batch class changes
- POST `/solo-change-class` - Individual class changes
- Validation page routes (GET `/homeV`, `/projectV`, `/configV`, `/labelingV`, `/statsV`)
- Error handling for validation operations

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test -- tests/integration/auth.test.js
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

### Run Tests Verbosely

```bash
npm test -- --verbose
```

### Run Tests with Specific Pattern

```bash
npm test -- --testNamePattern="should return 200"
```

## Test Mocking Strategy

The test suite uses comprehensive mocking to isolate the application logic:

### Database Mocking

- **SQLite3**: Mocked with Jest to avoid actual database operations
- **Query Functions**: Mocked to return predictable test data
- **Database Connections**: Simulated with mock objects

### File System Mocking

- **fs module**: Mocked to avoid actual file operations
- **File uploads**: Simulated with mock file objects
- **Directory operations**: Mocked to prevent test pollution

### External Dependencies

- **Image processing libraries** (sharp, ffmpeg)
- **Compression libraries** (decompress-zip, unzipper)
- **Stream processing** (node-stream-zip)
- **Socket.io**: Mocked for real-time communication testing

## Test Data and Fixtures

### Global Test Data

```javascript
global.db = {
  runAsync: jest.fn().mockResolvedValue(undefined),
  allAsync: jest.fn().mockResolvedValue([]),
  getAsync: jest.fn().mockResolvedValue({
    /* test data */
  }),
};
```

### Mock User Data

- Username: `testuser`
- Project: `test-project`
- Classes: `class1`, `class2`
- Images: `image1.jpg`, `image2.jpg`

## Common Test Patterns

### HTTP Request Testing

```javascript
const res = await request(app)
  .post("/endpoint")
  .send({ data: "test" })
  .set("Cookie", ["Username=testuser"]);

expect(res.statusCode).toBe(200);
expect(res.body).toEqual({ Success: "Yes" });
```

### Database Operation Testing

```javascript
expect(global.db.runAsync).toHaveBeenCalled();
expect(global.db.runAsync.mock.calls[0][0]).toMatch(/query/i);
```

### Error Handling Testing

```javascript
global.db.runAsync = jest.fn().mockRejectedValue(new Error("DB Error"));
const res = await request(app).get("/endpoint");
expect(res.statusCode).toBe(500);
```

## Contributing to Tests

When adding new features, ensure to:

1. Write corresponding tests for new functionality
2. Follow the existing test patterns and structure
3. Mock external dependencies appropriately
4. Test both success and error scenarios
5. Update this README if adding new test categories