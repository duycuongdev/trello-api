import { StatusCodes } from 'http-status-codes'
import { cardModel } from '~/models/cardModel'
import { columnModel } from '~/models/columnModel'
import { boardModel } from '~/models/boardModel'
import { cloudinaryProvider } from '~/providers/CloundinaryProvider'
import ApiError from '~/utils/ApiError'
import { GET_DB } from '~/config/mongodb'
import { ObjectId } from 'mongodb'
import { authorizationService } from '~/services/authorizationService'

const createNew = async (userId, reqBody) => {
  try {
    // Kiểm tra quyền: column nhận card mới phải thuộc board mà user là Owner/Member (fix IDOR)
    const { column } = await authorizationService.requireBoardAccessByColumnId(userId, reqBody.columnId)
    // Đảm bảo boardId gửi lên khớp board thực sự của column (tránh tạo card lệch dữ liệu)
    if (reqBody.boardId !== column.boardId.toString()) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid board information!')
    }

    const newCard = {
      ...reqBody
    }
    const createCard = await cardModel.createNew(newCard)
    const getNewCard = await cardModel.findOneById(createCard.insertedId)

    if (getNewCard) {
      await columnModel.pushCardOrderIds(getNewCard)
    }

    return getNewCard
  } catch (error) { throw error }
}

const update = async (cardId, reqBody, cardCoverFile, userInfo) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa card mới được cập nhật (fix IDOR)
    // Phải kiểm tra trước khi upload ảnh lên Cloudinary
    await authorizationService.requireBoardAccessByCardId(userInfo?._id, cardId)

    const updateData = {
      ...reqBody,
      updatedAt: Date.now()
    }

    let updatedCard = {}

    if (cardCoverFile) {
      const uploadResult = await cloudinaryProvider.streamUpload(cardCoverFile.buffer, 'cardCovers')
      updatedCard = await cardModel.update(cardId, {
        cover: uploadResult.secure_url
      })
    } else if (updateData.commentToAdd) {
      const commentData = {
        ...updateData.commentToAdd,
        _id: Date.now().toString(),
        userId: userInfo._id,
        userEmail: userInfo.email,
        commentedAt: Date.now()
      }
      updatedCard = await cardModel.unshiftNewComment(cardId, commentData)
    } else if (updateData.incomingMemberInfo || updateData.incomingMemberInfor) {
      const memberInfo = updateData.incomingMemberInfo || updateData.incomingMemberInfor
      updatedCard = await cardModel.updateMembers(cardId, memberInfo)
    } else {
      updatedCard = await cardModel.update(cardId, updateData)
    }

    return updatedCard
  } catch (error) { throw error }
}

const updateComment = async (cardId, commentId, content, userId) => {
  try {
    const targetCard = await cardModel.findOneById(cardId)
    if (!targetCard) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Card not found!')
    }

    const targetComment = targetCard.comments?.find(
      c => c._id?.toString() === commentId || c.commentedAt?.toString() === commentId
    )
    if (!targetComment) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Comment not found!')
    }

    // Chỉ tác giả bình luận mới có quyền chỉnh sửa bình luận
    if (targetComment.userId.toString() !== userId.toString()) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You can only edit your own comments!')
    }

    const updatedCard = await cardModel.updateComment(cardId, commentId, content, targetComment)
    return updatedCard
  } catch (error) { throw error }
}

const deleteComment = async (cardId, commentId, userId) => {
  try {
    const targetCard = await cardModel.findOneById(cardId)
    if (!targetCard) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Card not found!')
    }

    const targetComment = targetCard.comments?.find(
      c => c._id?.toString() === commentId || c.commentedAt?.toString() === commentId
    )
    if (!targetComment) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Comment not found!')
    }

    // Tác giả bình luận hoặc Chủ sở hữu bảng (Board Owner) có quyền xóa bình luận
    const board = await boardModel.findOneById(targetCard.boardId)
    const isOwner = board?.ownerIds?.some(id => id.toString() === userId.toString())
    const isAuthor = targetComment.userId.toString() === userId.toString()

    if (!isOwner && !isAuthor) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to delete this comment!')
    }

    const updatedCard = await cardModel.deleteComment(cardId, commentId, targetComment)
    return updatedCard
  } catch (error) { throw error }
}

const addAttachment = async (userId, cardId, file, isChecklistOnly = false) => {
  try {
    if (!file) throw new ApiError(StatusCodes.BAD_REQUEST, 'Please select a file to upload!')

    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa card mới được upload attachment (fix IDOR)
    // Phải kiểm tra trước khi upload file lên Cloudinary
    await authorizationService.requireBoardAccessByCardId(userId, cardId)

    const uploadResult = await cloudinaryProvider.streamUpload(file.buffer, 'cardAttachments')
    const attachmentData = {
      _id: Date.now().toString(),
      fileName: file.originalname,
      fileUrl: uploadResult.secure_url,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedAt: Date.now()
    }
    if (isChecklistOnly) {
      return attachmentData
    }
    const updatedCard = await cardModel.unshiftNewAttachment(cardId, attachmentData)
    return updatedCard
  } catch (error) { throw error }
}

const deleteAttachment = async (userId, cardId, attachmentId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa card mới được xóa attachment (fix IDOR)
    await authorizationService.requireBoardAccessByCardId(userId, cardId)

    const updatedCard = await cardModel.deleteAttachment(cardId, attachmentId)
    return updatedCard
  } catch (error) { throw error }
}

const deleteItem = async (cardId, userId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa card mới được xóa card
    const { card: targetCard } = await authorizationService.requireBoardAccessByCardId(userId, cardId)

    // Xóa card
    await cardModel.deleteOneById(cardId)

    // Xóa cardId khỏi mảng cardOrderIds của column chứa nó
    await columnModel.pullCardOrderIds(targetCard)

    return { deleteResult: 'Card deleted successfully!' }
  } catch (error) { throw error }
}

const copyCard = async (userId, cardId, reqBody) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa card mới được sao chép (fix IDOR)
    const { card: sourceCard } = await authorizationService.requireBoardAccessByCardId(userId, cardId)

    const { title, columnId, position, keepOptions = {} } = reqBody
    const targetColumn = await columnModel.findOneById(columnId)
    if (!targetColumn) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Target column not found!')
    }

    // Đảm bảo column đích thuộc cùng board với card nguồn (tránh copy card lệch board)
    if (targetColumn.boardId.toString() !== sourceCard.boardId.toString()) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Target column does not belong to this board!')
    }

    // Format checklists with new unique IDs if copied
    const checklistsToCopy = (keepOptions.checklists !== false && Array.isArray(sourceCard.checklists))
      ? sourceCard.checklists.map(cl => ({
        _id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
        title: cl.title,
        items: (cl.items || []).map(item => ({
          _id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
          title: item.title,
          isDone: Boolean(item.isDone),
          link: item.link || null,
          fileName: item.fileName || null,
          attachments: (item.attachments || []).map(att => ({
            _id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            url: att.url,
            fileName: att.fileName || null,
            isFile: Boolean(att.isFile)
          }))
        }))
      }))
      : []

    // Build duplicated card data
    const newCardData = {
      boardId: sourceCard.boardId.toString(),
      columnId: columnId.toString(),
      title: title.trim(),
      description: keepOptions.description !== false ? (sourceCard.description || '') : '',
      cover: keepOptions.cover !== false ? (sourceCard.cover || null) : null,
      labels: keepOptions.labels !== false ? (sourceCard.labels || []) : [],
      checklists: checklistsToCopy,
      dueDate: keepOptions.dueDate !== false ? (sourceCard.dueDate || null) : null,
      isDueDateComplete: keepOptions.dueDate !== false ? Boolean(sourceCard.isDueDateComplete) : false,
      attachments: keepOptions.attachments !== false ? (sourceCard.attachments || []) : [],
      memberIds: keepOptions.members !== false ? (sourceCard.memberIds || []).map(id => id.toString()) : [],
      comments: [] // Comments are not copied
    }

    const createCardResult = await cardModel.createNew(newCardData)
    const newCard = await cardModel.findOneById(createCardResult.insertedId)

    if (newCard) {
      // Insert into target column cardOrderIds at specific position if given, else push
      const currentOrder = (targetColumn.cardOrderIds || [])
        .filter(id => !id.toString().includes('placeholder-card'))
        .map(id => id.toString())

      const newCardIdStr = newCard._id.toString()
      const newOrder = [...currentOrder]

      if (typeof position === 'number' && position >= 0 && position <= newOrder.length) {
        newOrder.splice(position, 0, newCardIdStr)
      } else {
        newOrder.push(newCardIdStr)
      }

      await columnModel.update(columnId, {
        cardOrderIds: newOrder
      })
    }

    return newCard
  } catch (error) { throw error }
}

const archiveCard = async (userId, cardId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa card mới được lưu trữ (fix IDOR)
    const { card } = await authorizationService.requireBoardAccessByCardId(userId, cardId)

    const updatedCard = await cardModel.update(cardId, {
      _destroy: true,
      updatedAt: Date.now()
    })

    // Pull cardId from column cardOrderIds
    await columnModel.pullCardOrderIds(card)

    return updatedCard
  } catch (error) { throw error }
}

const restoreCard = async (userId, cardId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa card mới được khôi phục (fix IDOR)
    const { card } = await authorizationService.requireBoardAccessByCardId(userId, cardId)

    // Check if original column exists and is active
    let targetColumn = await columnModel.findOneById(card.columnId)
    let finalColumnId = card.columnId

    if (!targetColumn || targetColumn._destroy === true) {
      const firstActiveCol = await GET_DB().collection(columnModel.COLUMN_COLLECTION_NAME).findOne({
        boardId: new ObjectId(card.boardId),
        _destroy: { $ne: true }
      })
      if (!firstActiveCol) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot restore card because there are no active columns on this board!')
      }
      targetColumn = firstActiveCol
      finalColumnId = firstActiveCol._id
    }

    const updatedCard = await cardModel.update(cardId, {
      _destroy: false,
      columnId: finalColumnId,
      updatedAt: Date.now()
    })

    await columnModel.pushCardOrderIds({ ...card, columnId: finalColumnId })

    return updatedCard
  } catch (error) { throw error }
}

export const cardService = {
  createNew,
  update,
  updateComment,
  deleteComment,
  addAttachment,
  deleteAttachment,
  deleteItem,
  copyCard,
  archiveCard,
  restoreCard
}
