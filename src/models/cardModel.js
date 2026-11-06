import Joi from 'joi'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE, EMAIL_RULE, EMAIL_RULE_MESSAGE } from '~/utils/validators'
import { GET_DB } from '~/config/mongodb'
import { ObjectId } from 'mongodb'
import { CARD_MEMBER_ACTION } from '~/utils/constants'

// Define Collection (name & schema)
const CARD_COLLECTION_NAME = 'cards'
const CARD_COLLECTION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  columnId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  title: Joi.string().required().min(1).max(255).trim().strict(),
  description: Joi.string().allow('', null).optional().default(''),
  cover: Joi.string().allow(null, '').default(null),
  labels: Joi.array().items(
    Joi.object({
      title: Joi.string().allow('').optional(),
      color: Joi.string().required()
    })
  ).default([]),
  checklists: Joi.array().items(
    Joi.object({
      _id: Joi.string().optional(),
      title: Joi.string().required().trim(),
      // Hạn chót + thành viên ở CẤP CHECKLIST (micro-task list)
      dueDate: Joi.date().timestamp('javascript').allow(null).default(null),
      memberIds: Joi.array().items(
        Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
      ).default([]),
      items: Joi.array().items(
        Joi.object({
          _id: Joi.string().optional(),
          title: Joi.string().required().trim(),
          isDone: Joi.boolean().default(false),
          // Hạn chót + thành viên ở CẤP ITEM
          dueDate: Joi.date().timestamp('javascript').allow(null).default(null),
          memberIds: Joi.array().items(
            Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
          ).default([]),
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
  ).default([]),
  dueDate: Joi.date().timestamp('javascript').allow(null).default(null),
  reminderMinutes: Joi.number().integer().min(0).allow(null).default(1440),
  isDueDateComplete: Joi.boolean().default(false),
  attachments: Joi.array().items(
    Joi.object({
      _id: Joi.string().required(),
      fileName: Joi.string().required(),
      fileUrl: Joi.string().required(),
      fileType: Joi.string().allow('').optional(),
      fileSize: Joi.number().optional(),
      uploadedAt: Joi.date().timestamp('javascript').default(Date.now)
    })
  ).default([]),
  memberIds: Joi.array().items(
    Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  ).default([]),
  // Dữ liệu comments của Card nhúng embedded trong document Card
  comments: Joi.array().items({
    _id: Joi.string().optional(),
    userId: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
    userEmail: Joi.string().pattern(EMAIL_RULE).message(EMAIL_RULE_MESSAGE),
    userAvatar: Joi.string(),
    userDisplayName: Joi.string(),
    content: Joi.string(),
    commentedAt: Joi.date().timestamp(),
    editedAt: Joi.date().timestamp().optional()
  }).default([]),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false)
})

const INVALID_UPDATE_FIELDS = ['_id', 'boardId', 'createdAt']

const validateBeforeCreate = async (data) => {
  return await CARD_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data, { session } = {}) => {
  try {
    const validData = await validateBeforeCreate(data)
    const newCardToAdd = {
      ...validData,
      boardId: new ObjectId(validData.boardId),
      columnId: new ObjectId(validData.columnId),
      memberIds: (validData.memberIds || []).map(id => new ObjectId(id))
    }

    const createCard = await GET_DB().collection(CARD_COLLECTION_NAME).insertOne(newCardToAdd, { session })
    return createCard
  } catch (error) { throw new Error(error) }
}

const findOneById = async (cardId, { session } = {}) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) }, { session })
    return result
  } catch (error) { throw new Error(error) }
}

const update = async (cardId, updateData, { session } = {}) => {
  try {
    // lọc những field không cho phép cập nhật linh tinh
    Object.keys(updateData).forEach(fieldName => {
      if (INVALID_UPDATE_FIELDS.includes(fieldName)) {
        delete updateData[fieldName]
      }
    })

    // đối với những dữ liệu liên quan ObjectId, biến đổi ở đây
    if (updateData.columnId) updateData.columnId = new ObjectId(updateData.columnId)

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: updateData },
      { returnDocument: 'after', session }
    )

    return result
  } catch (error) { throw new Error(error) }
}

const deleteManyByColumnId = async (columnId, { session } = {}) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).deleteMany({ columnId: new ObjectId(columnId) }, { session })
    return result
  } catch (error) { throw new Error(error) }
}

// function to use push element in the first position of array
const unshiftNewComment = async (cardId, commentData, { session } = {}) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $push: { comments: { $each: [commentData], $position: 0 } } },
      { returnDocument: 'after', session }
    )

    return result
  } catch (error) { throw new Error(error) }
}

// Cập nhật nội dung một comment trong Card
const updateComment = async (cardId, commentId, content, targetComment, { session } = {}) => {
  try {
    // Xác định chính xác điều kiện tìm comment trong mảng (tránh dùng $or với toán tử $ của MongoDB)
    const hasId = Boolean(targetComment?._id || (commentId && isNaN(Number(commentId))))
    const query = {
      _id: new ObjectId(cardId),
      ...(hasId
        ? { 'comments._id': targetComment?._id || commentId }
        : { 'comments.commentedAt': targetComment?.commentedAt || Number(commentId) })
    }

    const updateFields = {
      'comments.$.content': content,
      'comments.$.editedAt': Date.now()
    }

    // Nếu comment cũ trong DB chưa có _id, gán luôn _id mới để chuẩn hóa dữ liệu
    if (!targetComment?._id) {
      updateFields['comments.$._id'] = commentId || Date.now().toString()
    }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      query,
      { $set: updateFields },
      { returnDocument: 'after', session }
    )

    return result
  } catch (error) { throw new Error(error) }
}

// Xóa một comment khỏi Card
const deleteComment = async (cardId, commentId, targetComment, { session } = {}) => {
  try {
    const hasId = Boolean(targetComment?._id || (commentId && isNaN(Number(commentId))))
    const pullCondition = hasId
      ? { _id: targetComment?._id || commentId }
      : { commentedAt: targetComment?.commentedAt || Number(commentId) }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      {
        $pull: {
          comments: pullCondition
        }
      },
      { returnDocument: 'after', session }
    )

    return result
  } catch (error) { throw new Error(error) }
}

// Thêm tệp đính kèm mới vào vị trí đầu mảng attachments
const unshiftNewAttachment = async (cardId, attachmentData, { session } = {}) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $push: { attachments: { $each: [attachmentData], $position: 0 } } },
      { returnDocument: 'after', session }
    )
    return result
  } catch (error) { throw new Error(error) }
}

// Xóa tệp đính kèm theo attachmentId
const deleteAttachment = async (cardId, attachmentId, { session } = {}) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $pull: { attachments: { _id: attachmentId } } },
      { returnDocument: 'after', session }
    )
    return result
  } catch (error) { throw new Error(error) }
}

const updateMembers = async (cardId, incomingMemberInfo, { session } = {}) => {
  try {
    let updateCondition = {}

    if (incomingMemberInfo.action === CARD_MEMBER_ACTION.ADD) {
      updateCondition = { $push: { memberIds: new ObjectId(incomingMemberInfo.userId) } }
    }

    if (incomingMemberInfo.action === CARD_MEMBER_ACTION.REMOVE) {
      updateCondition = { $pull: { memberIds: new ObjectId(incomingMemberInfo.userId) } }
    }

    const result = await GET_DB()
      .collection(CARD_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(cardId) },
        updateCondition,
        { returnDocument: 'after', session }
      )

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteOneById = async (cardId, { session } = {}) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).deleteOne({ _id: new ObjectId(cardId) }, { session })
    return result
  } catch (error) { throw new Error(error) }
}

const deleteManyByBoardId = async (boardId, { session } = {}) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).deleteMany({ boardId: new ObjectId(boardId) }, { session })
    return result
  } catch (error) { throw new Error(error) }
}

const findDueCardsByUser = async (userId) => {
  try {
    const now = Date.now()
    const userObjectId = new ObjectId(userId.toString())
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).aggregate([
      {
        $match: {
          _destroy: { $ne: true },
          isDueDateComplete: { $ne: true },
          dueDate: { $ne: null }
        }
      },
      {
        $lookup: {
          from: 'boards',
          localField: 'boardId',
          foreignField: '_id',
          as: 'board'
        }
      },
      {
        $match: {
          'board.0._destroy': { $ne: true },
          $or: [
            { memberIds: userObjectId },
            { memberIds: userId.toString() }


          ]
        }
      }
    ]).toArray()

    const dueCards = []
    for (const card of result) {
      const dueTimestamp = typeof card.dueDate === 'number' ? card.dueDate : new Date(card.dueDate).getTime()
      if (isNaN(dueTimestamp)) continue

      const isOverdue = now > dueTimestamp
      const reminderMinutes = (card.reminderMinutes !== undefined && card.reminderMinutes !== null) ? Number(card.reminderMinutes) : 1440
      const reminderTime = reminderMinutes !== null ? (dueTimestamp - (reminderMinutes * 60 * 1000)) : null
      const isReminderReached = reminderTime !== null && now >= reminderTime

      if (isOverdue || isReminderReached) {
        dueCards.push({
          _id: `deadline_${card._id}_${dueTimestamp}_${isOverdue ? 'overdue' : 'due'}`,
          type: 'CARD_DEADLINE',
          cardId: card._id.toString(),
          boardId: card.boardId.toString(),
          boardTitle: card.board[0]?.title || 'Untitled Board',
          cardTitle: card.title,
          dueDate: dueTimestamp,
          deadlineStatus: isOverdue ? 'OVERDUE' : 'DUE_SOON',
          createdAt: dueTimestamp
        })
      }
    }

    return dueCards
  } catch (error) { throw error }
}

const pullMemberFromAllCardsInBoard = async (boardId, userId) => {
  try {
    const userObjectId = new ObjectId(userId)
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).updateMany(
      { boardId: new ObjectId(boardId) },
      {
        $pull: {
          memberIds: { $in: [userObjectId, userId.toString()] }
        }
      }
    )
    return result
  } catch (error) { throw new Error(error) }
}

export const cardModel = {
  CARD_COLLECTION_NAME,
  CARD_COLLECTION_SCHEMA,
  createNew,
  findOneById,
  update,
  deleteManyByColumnId,
  unshiftNewComment,
  updateComment,
  deleteComment,
  unshiftNewAttachment,
  deleteAttachment,
  deleteOneById,
  updateMembers,
  deleteManyByBoardId,
  findDueCardsByUser,
  pullMemberFromAllCardsInBoard
}
