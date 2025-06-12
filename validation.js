// validation.js
const Joi = require('joi');


// User registration validation
const registerSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
    }),
    username: Joi.string().alphanum().min(3).max(30).required().messages({
        'string.alphanum': 'Username must contain only letters and numbers',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must not exceed 30 characters',
        'any.required': 'Username is required'
    }),
    password: Joi.string().min(6).required().messages({
        'string.min': 'Password must be at least 6 characters long',
        'any.required': 'Password is required'
    }),
    firstName: Joi.string().min(1).max(50).required().messages({
        'string.min': 'First name cannot be empty',
        'string.max': 'First name must not exceed 50 characters',
        'any.required': 'First name is required'
    }),
    lastName: Joi.string().min(1).max(50).required().messages({
        'string.min': 'Last name cannot be empty',
        'string.max': 'Last name must not exceed 50 characters',
        'any.required': 'Last name is required'
    })
});


// User login validation
const loginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
        'any.required': 'Password is required'
    })
});


// Post creation validation
const createPostSchema = Joi.object({
    title: Joi.string().min(1).max(200).required().messages({
        'string.min': 'Title cannot be empty',
        'string.max': 'Title must not exceed 200 characters',
        'any.required': 'Title is required'
    }),
    content: Joi.string().min(1).required().messages({
        'string.min': 'Content cannot be empty',
        'any.required': 'Content is required'
    }),
    published: Joi.boolean().default(false)
});


// Post update validation
const updatePostSchema = Joi.object({
    title: Joi.string().min(1).max(200).messages({
        'string.min': 'Title cannot be empty',
        'string.max': 'Title must not exceed 200 characters'
    }),
    content: Joi.string().min(1).messages({
        'string.min': 'Content cannot be empty'
    }),
    published: Joi.boolean()
}).min(1); // At least one field must be provided


// Validation middleware
const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.details.map(detail => detail.message)
            });
        }
        next();
    };
};


module.exports = {
    registerSchema,
    loginSchema,
    createPostSchema,
    updatePostSchema,
    validate
};
