import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'

const createNew = async (req, res, next) => {
  const correctCondition = Joi.object({
    boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
    columnId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
    title: Joi.string().required().min(3).max(50).trim().strict()
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, new Error(error).message))
  }
}

const update = async (req, res, next) => {
  // Lưu ý không dùng hàm required() trong trường hợp Update
  const correctCondition = Joi.object({
    title: Joi.string().min(1).max(255).trim(),
    description: Joi.string().allow('', null).optional(),
    labels: Joi.array().items(
      Joi.object({
        title: Joi.string().allow('').optional(),
        color: Joi.string().required()
      })
    ).optional(),
    checklists: Joi.array().items(
      Joi.object({
        _id: Joi.string().optional(),
        title: Joi.string().required().trim(),
        dueDate: Joi.date().timestamp('javascript').allow(null).optional(),
        memberIds: Joi.array().items(
          Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
        ).optional(),
        items: Joi.array().items(
          Joi.object({
            _id: Joi.string().optional(),
            title: Joi.string().required().trim(),
            isDone: Joi.boolean().default(false),
            dueDate: Joi.date().timestamp('javascript').allow(null).optional(),
            memberIds: Joi.array().items(
              Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
            ).optional(),
            link: Joi.string().allow(null, '').optional(),
            fileName: Joi.string().allow(null, '').optional(),
            attachments: Joi.array().items(
              Joi.object({
                _id: Joi.string().optional(),
                url: Joi.string().required(),
                fileName: Joi.string().allow(null, '').optional(),
                isFile: Joi.boolean().default(false)
              })
            ).default([])
          })
        ).default([])
      })
    ).optional(),
    dueDate: Joi.date().timestamp('javascript').allow(null).optional(),
    reminderMinutes: Joi.number().integer().min(0).allow(null).optional(),
    isDueDateComplete: Joi.boolean().optional(),
    attachments: Joi.array().items(
      Joi.object({
        _id: Joi.string().required(),
        fileName: Joi.string().required(),
        fileUrl: Joi.string().required(),
        fileType: Joi.string().allow('').optional(),
        fileSize: Joi.number().optional(),
        uploadedAt: Joi.date().timestamp('javascript').default(Date.now)
      })
    ).optional()
  })

  try {
    // Chỉ định abortEarly: false để trường hợp có nhiều lỗi validation thì trả về tất cả lỗi (video 52)
    // Đối với trường hợp update, cho phép Unknown để không cần đẩy một số field lên
    await correctCondition.validateAsync(req.body, {
      abortEarly: false,
      allowUnknown: true
    })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, new Error(error).message))
  }
}

const updateComment = async (req, res, next) => {
  const correctCondition = Joi.object({
    content: Joi.string().required().trim().min(1)
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, new Error(error).message))
  }
}

const deleteItem = async (req, res, next) => {
  const correctCondition = Joi.object({
    id: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  })

  try {
    await correctCondition.validateAsync(req.params)
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, new Error(error).message))
  }
}

const copyCard = async (req, res, next) => {
  const correctParamCondition = Joi.object({
    id: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  })

  const correctBodyCondition = Joi.object({
    title: Joi.string().required().min(1).max(255).trim(),
    columnId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
    position: Joi.number().integer().min(0).optional(),
    keepOptions: Joi.object({
      checklists: Joi.boolean().optional(),
      labels: Joi.boolean().optional(),
      attachments: Joi.boolean().optional(),
      dueDate: Joi.boolean().optional(),
      members: Joi.boolean().optional(),
      cover: Joi.boolean().optional(),
      description: Joi.boolean().optional()
    }).optional()
  })

  try {
    await correctParamCondition.validateAsync(req.params)
    await correctBodyCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, new Error(error).message))
  }
}

export const cardValidation = {
  createNew,
  update,
  updateComment,
  deleteItem,
  copyCard
}
